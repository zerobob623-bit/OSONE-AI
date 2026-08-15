import express, { type Express, type Request } from 'express';
import Stripe from 'stripe';
import { applicationDefault, cert, getApps, initializeApp, type App as FirebaseAdminApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

type PlanId = 'free' | 'plus' | 'pro' | 'max';
type Interval = 'month' | 'year';
type PaymentMethod = 'card' | 'pix';
type PaidPlanId = Exclude<PlanId, 'free'>;
const PAID_PLAN_IDS: PaidPlanId[] = ['plus', 'pro', 'max'];

const PRICE_ENV: Record<Exclude<PlanId, 'free'>, Record<Interval, string>> = {
  plus: { month: 'STRIPE_PRICE_PLUS_MONTHLY', year: 'STRIPE_PRICE_PLUS_YEARLY' },
  pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_YEARLY' },
  max: { month: 'STRIPE_PRICE_MAX_MONTHLY', year: 'STRIPE_PRICE_MAX_YEARLY' }
};

const EXPECTED_PRICE: Record<Exclude<PlanId, 'free'>, Record<Interval, number>> = {
  plus: { month: 3990, year: 33990 },
  pro: { month: 6990, year: 66990 },
  max: { month: 11990, year: 119990 }
};

let stripeClient: Stripe | null = null;
let firebaseApp: FirebaseAdminApp | null = null;
let firestore: Firestore | null = null;
let pixAvailabilityCache: { value: boolean; expiresAt: number } | null = null;

/** Acesso por cartão exige assinatura viva E pelo menos uma fatura paga no valor anunciado. */
const ACCESS_GRANTING_STATUSES: Stripe.Subscription.Status[] = ['active', 'past_due'];

/** Tentativas mortas: não liberam nada e não voltam a cobrar sozinhas. */
const STALE_STATUSES: Stripe.Subscription.Status[] = ['incomplete', 'incomplete_expired', 'trialing', 'unpaid'];

const BILLING_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'invoice.payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);

function env(name: string): string { return String(process.env[name] || '').trim(); }

function billingPlansConfigured(): Record<PaidPlanId, boolean> {
  return Object.fromEntries(PAID_PLAN_IDS.map(plan => [
    plan,
    !!env(PRICE_ENV[plan].month) && !!env(PRICE_ENV[plan].year)
  ])) as Record<PaidPlanId, boolean>;
}

function billingConfiguration() {
  const missing = [
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PLUS_MONTHLY',
    'STRIPE_PRICE_PLUS_YEARLY', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY',
    'OSONE_BILLING_RETURN_URL'
  ].filter(name => !env(name));
  const serviceAccountJson = env('FIREBASE_SERVICE_ACCOUNT_JSON');
  const applicationCredentials = env('GOOGLE_APPLICATION_CREDENTIALS');
  const firebaseConfigured = !!(serviceAccountJson || applicationCredentials);
  if (!firebaseConfigured) {
    missing.push('FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS');
  } else if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson.replace(/^'|'$/g, ''));
      if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
        missing.push('FIREBASE_SERVICE_ACCOUNT_JSON válido');
      }
    } catch {
      missing.push('FIREBASE_SERVICE_ACCOUNT_JSON válido');
    }
  } else if (process.env.VERCEL === '1') {
    // Um caminho como /home/usuario/Downloads/chave.json existe só no computador do dono. Na
    // Vercel ele fazia a tela dizer "configurado" e falhar apenas depois do clique em assinar.
    missing.push('FIREBASE_SERVICE_ACCOUNT_JSON (obrigatório na Vercel)');
  }
  const returnUrl = env('OSONE_BILLING_RETURN_URL');
  let returnOrigin: string | null = null;
  if (returnUrl) {
    try {
      const parsed = new URL(returnUrl);
      returnOrigin = parsed.origin;
      const localDevelopment = ['localhost', '127.0.0.1'].includes(parsed.hostname);
      if (parsed.protocol !== 'https:' && !localDevelopment) missing.push('OSONE_BILLING_RETURN_URL HTTPS válida');
    } catch {
      missing.push('OSONE_BILLING_RETURN_URL HTTPS válida');
    }
  }
  return { enabled: missing.length === 0, missing: [...new Set(missing)], returnOrigin };
}

function stripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(env('STRIPE_SECRET_KEY'));
  return stripeClient;
}

async function pixAvailable(): Promise<boolean> {
  if (pixAvailabilityCache && pixAvailabilityCache.expiresAt > Date.now()) return pixAvailabilityCache.value;
  try {
    const configurations = await stripe().paymentMethodConfigurations.list({ limit: 100 });
    const active = configurations.data.find(configuration => configuration.active);
    const pix = active?.pix;
    const value = !!pix?.available && pix.display_preference?.value === 'on';
    pixAvailabilityCache = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  } catch {
    pixAvailabilityCache = { value: false, expiresAt: Date.now() + 60_000 };
    return false;
  }
}

function adminServices(): { app: FirebaseAdminApp; db: Firestore } {
  if (firebaseApp && firestore) return { app: firebaseApp, db: firestore };
  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
  } else {
    const json = env('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (json) {
      const serviceAccount = JSON.parse(json.replace(/^'|'$/g, ''));
      firebaseApp = initializeApp({ credential: cert(serviceAccount) });
    } else {
      firebaseApp = initializeApp({ credential: applicationDefault(), projectId: env('FIREBASE_PROJECT_ID') });
    }
  }
  firestore = getFirestore(firebaseApp, env('FIREBASE_FIRESTORE_DATABASE_ID') || '(default)');
  return { app: firebaseApp, db: firestore };
}

async function authenticatedUser(req: Request) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Entre com sua conta Google para continuar.'), { status: 401 });
  const { app } = adminServices();
  try {
    return await getAuth(app).verifyIdToken(header.slice(7));
  } catch (err: any) {
    /**
     * Sem isto, um token expirado (o caso normal depois de ~1h de sessão) chegava a sendError()
     * sem `.status`, caindo no 500 genérico em vez do 401 que diz ao cliente para entrar de novo
     * — e gerando um console.error com stack trace para cada expiração rotineira de sessão.
     */
    throw Object.assign(new Error(err?.message || 'Sessão do Google inválida ou expirada.'), { status: 401 });
  }
}

function priceId(plan: PaidPlanId, interval: Interval): string {
  return env(PRICE_ENV[plan][interval]);
}

export function billingResultUrl(returnUrl: string, result: 'success' | 'canceled'): string {
  const url = new URL(returnUrl);
  url.searchParams.set('billing', result);
  return url.toString();
}

/**
 * O texto da tela não decide quanto será cobrado: quem decide é o Price ID da Stripe. Conferir
 * moeda, valor e recorrência antes de criar cada Checkout impede que um ID colado no campo errado
 * cobre, por exemplo, o anual como mensal ou um produto de outro valor.
 */
export function validateStripePrice(
  price: Pick<Stripe.Price, 'active' | 'currency' | 'unit_amount' | 'type' | 'recurring'>,
  plan: PaidPlanId,
  interval: Interval
) {
  const expectedAmount = EXPECTED_PRICE[plan][interval];
  const valid = price.active && price.currency.toLowerCase() === 'brl' &&
    price.unit_amount === expectedAmount && price.type === 'recurring' &&
    price.recurring?.interval === interval && price.recurring?.interval_count === 1;
  if (!valid) {
    throw Object.assign(new Error(
      `O Price ID de ${plan.toUpperCase()} ${interval === 'month' ? 'mensal' : 'anual'} não corresponde ao valor, moeda ou período anunciado. O pagamento foi bloqueado para evitar cobrança incorreta.`
    ), { status: 503 });
  }
}

function planFromPrice(price: string | null | undefined): PlanId {
  if (!price) return 'free';
  for (const plan of PAID_PLAN_IDS) {
    if ([priceId(plan, 'month'), priceId(plan, 'year')].includes(price)) return plan;
  }
  return 'free';
}

function intervalFromPrice(price: string | null | undefined): Interval | null {
  if (!price) return null;
  if (PAID_PLAN_IDS.map(plan => priceId(plan, 'month')).includes(price)) return 'month';
  if (PAID_PLAN_IDS.map(plan => priceId(plan, 'year')).includes(price)) return 'year';
  return null;
}

/**
 * Soma 1 mês (ou 1 ano) a `start` sem deixar o resultado transbordar para o mês seguinte.
 *
 * `setUTCMonth`/`setUTCFullYear` não travam no tamanho do mês de destino: 31 de janeiro + 1 mês
 * vira 3 de março (fevereiro só tem 28), não 28 de fevereiro. Como isto calcula o vencimento de
 * assinaturas pagas via PIX, o transbordo dava alguns dias de acesso pago de graça para todo
 * assinante que pagasse nos últimos dias de um mês mais curto que o seguinte — e o mesmo vale
 * para 29 de fevereiro num plano anual que cai num ano não bissexto.
 */
export function pixPeriodEnd(start: Date, interval: Interval): Date {
  const originalDay = start.getUTCDate();
  const monthsToAdd = interval === 'month' ? 1 : 12;
  const targetMonthIndex = start.getUTCMonth() + monthsToAdd;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const end = new Date(start);
  end.setUTCFullYear(targetYear, targetMonth, Math.min(originalDay, lastDayOfTargetMonth));
  return end;
}

export function validatePixCheckout(
  session: Pick<Stripe.Checkout.Session, 'mode' | 'payment_status' | 'currency' | 'amount_total'>,
  plan: PaidPlanId,
  interval: Interval
) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.currency?.toLowerCase() !== 'brl' || session.amount_total !== EXPECTED_PRICE[plan][interval]) {
    throw new Error('Pagamento PIX não confirmado ou com valor divergente; acesso não liberado.');
  }
}

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

async function rememberCustomer(uid: string, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  const customerId = stripeCustomerId(customer);
  if (!customerId) return;
  const { db } = adminServices();
  const ref = db.collection('billingCustomers').doc(uid);
  await ref.set({ stripeCustomerId: customerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function storedCustomerFor(uid: string): Promise<string | null> {
  const { db } = adminServices();
  const ref = db.collection('billingCustomers').doc(uid);
  const stored = await ref.get();
  const existingId = stored.data()?.stripeCustomerId;
  if (existingId) return existingId;
  return null;
}

async function subscriptionsFor(customer: string): Promise<Stripe.Subscription[]> {
  const subscriptions = await stripe().subscriptions.list({ customer, status: 'all', limit: 20 });
  return subscriptions.data;
}

/**
 * Separa o que impede um novo Checkout do que apenas sobrou de uma tentativa fracassada.
 *
 * Só bloqueia quem realmente dá acesso — exatamente as situações que `writeEntitlement` credita.
 * Uma assinatura `incomplete` (cartão recusado na primeira cobrança, ou 3-D Secure abandonado)
 * não libera plano nenhum e expira sozinha em ~23 h. Tratá-la como assinatura válida prendia o
 * cliente: ele recebia "já possui uma assinatura", não conseguia tentar outro cartão, e nunca era
 * cobrado. `unpaid` é o mesmo beco sem saída depois que a Stripe desiste das novas tentativas.
 */
export function classifySubscriptions(
  subscriptions: Array<Pick<Stripe.Subscription, 'id' | 'status'>>
): { blocking: string[]; stale: string[] } {
  const blocking: string[] = [];
  const stale: string[] = [];
  for (const subscription of subscriptions) {
    if (ACCESS_GRANTING_STATUSES.includes(subscription.status)) blocking.push(subscription.id);
    else if (STALE_STATUSES.includes(subscription.status)) stale.push(subscription.id);
  }
  return { blocking, stale };
}

/**
 * Cancelar a tentativa morta antes de abrir a próxima também anula a fatura pendente dela. Sem
 * isso, quem voltasse à aba antiga do Checkout poderia concluir as duas e pagar em dobro.
 * Falhar aqui não impede o novo pagamento: a assinatura pendente expira sozinha na Stripe.
 */
async function cancelStaleSubscriptions(ids: string[]) {
  for (const id of ids) {
    try {
      await stripe().subscriptions.cancel(id);
    } catch (err: any) {
      console.warn(`[Billing] Assinatura pendente ${id} não pôde ser cancelada:`, err?.message || err);
    }
  }
}

function invoiceHasPrice(invoice: Pick<Stripe.Invoice, 'lines'>, expectedPriceId: string): boolean {
  return !!invoice.lines?.data?.some((line: any) => line?.price?.id === expectedPriceId || line?.pricing?.price_details?.price === expectedPriceId);
}

export function invoiceConfirmsExpectedPayment(
  invoice: Pick<Stripe.Invoice, 'status' | 'currency' | 'amount_paid' | 'lines'> & { paid?: boolean },
  plan: PaidPlanId,
  interval: Interval,
  expectedPriceId?: string
): boolean {
  const paid = (invoice as any).paid === true || invoice.status === 'paid';
  const expectedAmount = EXPECTED_PRICE[plan][interval];
  const amountMatches = invoice.amount_paid === expectedAmount;
  const currencyMatches = String(invoice.currency || '').toLowerCase() === 'brl';
  const priceMatches = !expectedPriceId || invoiceHasPrice(invoice, expectedPriceId);
  return paid && currencyMatches && amountMatches && priceMatches;
}

async function retrieveInvoice(id: string): Promise<Stripe.Invoice | null> {
  try {
    return await stripe().invoices.retrieve(id, { expand: ['lines.data.price'] });
  } catch (err: any) {
    console.warn(`[Billing] Não foi possível conferir a fatura ${id}:`, err?.message || err);
    return null;
  }
}

async function findPaidInvoice(subscription: Stripe.Subscription, plan: PaidPlanId, interval: Interval): Promise<Stripe.Invoice | null> {
  const expectedPriceId = priceId(plan, interval);
  const latest = subscription.latest_invoice;
  const latestInvoice = typeof latest === 'string' ? await retrieveInvoice(latest) : latest;
  if (latestInvoice && invoiceConfirmsExpectedPayment(latestInvoice, plan, interval, expectedPriceId)) {
    return latestInvoice;
  }

  const invoices = await stripe().invoices.list({
    subscription: subscription.id,
    status: 'paid',
    limit: 12,
    expand: ['data.lines.data.price']
  } as any);
  return invoices.data.find(invoice => invoiceConfirmsExpectedPayment(invoice, plan, interval, expectedPriceId)) || null;
}

async function subscriptionEntitlement(subscription: Stripe.Subscription) {
  const uid = subscription.metadata?.firebaseUid;
  if (!uid) throw new Error(`Assinatura ${subscription.id} sem firebaseUid.`);
  const firstItem = subscription.items.data[0];
  const price = firstItem?.price?.id;
  const plan = planFromPrice(price);
  const interval = intervalFromPrice(price);
  const paidInvoice = plan !== 'free' && interval ? await findPaidInvoice(subscription, plan, interval) : null;
  const grantsAccess = plan !== 'free' && !!paidInvoice && ACCESS_GRANTING_STATUSES.includes(subscription.status);
  const periodEnd = firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000).toISOString() : null;
  return {
    uid,
    plan: grantsAccess ? plan : 'free',
    status: subscription.status,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: stripeCustomerId(subscription.customer),
    stripeSubscriptionId: subscription.id,
    billingMethod: 'card',
    paid: grantsAccess,
    paidAmount: paidInvoice?.amount_paid || null,
    paidCurrency: paidInvoice?.currency || null,
    paidInvoiceId: paidInvoice?.id || null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: FieldValue.serverTimestamp()
  };
}

async function writeEntitlement(subscription: Stripe.Subscription) {
  const entitlement = await subscriptionEntitlement(subscription);
  const { uid, ...data } = entitlement;
  const { db } = adminServices();
  await rememberCustomer(uid, subscription.customer);
  await db.collection('entitlements').doc(uid).set(data, { merge: true });
}

async function writePixEntitlement(session: Stripe.Checkout.Session) {
  const uid = session.metadata?.firebaseUid;
  const plan = session.metadata?.plan as PaidPlanId;
  const interval = session.metadata?.interval as Interval;
  if (!uid || !PAID_PLAN_IDS.includes(plan) || !['month', 'year'].includes(interval) || session.metadata?.paymentMethod !== 'pix') {
    throw new Error(`Checkout PIX ${session.id} sem metadados válidos.`);
  }
  validatePixCheckout(session, plan, interval);

  const { db } = adminServices();
  const purchaseRef = db.collection('billingPurchases').doc(session.id);
  const entitlementRef = db.collection('entitlements').doc(uid);
  await db.runTransaction(async transaction => {
    if ((await transaction.get(purchaseRef)).exists) return;
    const now = new Date();
    const currentPeriodEnd = pixPeriodEnd(now, interval).toISOString();
    transaction.set(entitlementRef, {
      plan,
      status: 'active',
      billingMethod: 'pix',
      currentPeriodEnd,
      stripeCustomerId: stripeCustomerId(session.customer),
      stripeCheckoutSessionId: session.id,
      stripeSubscriptionId: FieldValue.delete(),
      paid: true,
      paidAmount: session.amount_total,
      paidCurrency: session.currency,
      cancelAtPeriodEnd: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.create(purchaseRef, {
      uid, plan, interval, amount: session.amount_total, currency: session.currency,
      currentPeriodEnd, processedAt: FieldValue.serverTimestamp()
    });
  });
  await rememberCustomer(uid, session.customer);
}

function sendError(res: express.Response, err: any) {
  const status = Number(err?.status) || 500;
  const safeMessage = status < 500 ? err?.message : 'Falha interna no serviço de cobrança.';
  if (status >= 500) console.error('[Billing]', err);
  res.status(status).json({ error: safeMessage });
}

/** Deve ser registrado ANTES de express.json para preservar os bytes assinados pela Stripe. */
export function registerBillingWebhook(app: Express) {
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.status(503).json({ error: 'Cobrança não configurada.' });
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature) return res.status(400).send('Assinatura Stripe ausente.');
      const event = stripe().webhooks.constructEvent(req.body, signature, env('STRIPE_WEBHOOK_SECRET'));
      if (!BILLING_EVENTS.has(event.type)) {
        return res.json({ received: true, ignored: true });
      }
      const { db } = adminServices();
      const eventRef = db.collection('billingEvents').doc(event.id);
      if ((await eventRef.get()).exists) return res.json({ received: true, duplicate: true });

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subscription = await stripe().subscriptions.retrieve(String(session.subscription));
          await writeEntitlement(subscription);
        } else if (session.mode === 'payment' && session.payment_status === 'paid') {
          await writePixEntitlement(session);
        }
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        await writePixEntitlement(event.data.object as Stripe.Checkout.Session);
      } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as Stripe.Invoice;
        const rawInvoice = invoice as any;
        const subscriptionId = typeof rawInvoice.subscription === 'string'
          ? rawInvoice.subscription
          : rawInvoice.subscription?.id || rawInvoice.parent?.subscription_details?.subscription;
        if (subscriptionId) {
          const subscription = await stripe().subscriptions.retrieve(subscriptionId);
          await writeEntitlement(subscription);
        }
      } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        // Eventos podem chegar fora de ordem. Reconsultar o objeto atual evita que um evento
        // atrasado de "active" sobrescreva um cancelamento que já ocorreu.
        const eventSubscription = event.data.object as Stripe.Subscription;
        const currentSubscription = await stripe().subscriptions.retrieve(eventSubscription.id);
        await writeEntitlement(currentSubscription);
      }

      await eventRef.set({ type: event.type, processedAt: FieldValue.serverTimestamp() });
      return res.json({ received: true });
    } catch (err: any) {
      if (err?.type === 'StripeSignatureVerificationError') {
        // Não registre o objeto inteiro: ele contém o header de assinatura recebido. Basta saber
        // que a autenticação falhou; o conteúdo não ajuda a corrigir e não deve ir para logs.
        console.warn('[Billing webhook] Evento recusado por assinatura inválida.');
        return res.status(400).send('Webhook recusado: assinatura inválida.');
      }
      // Falha de Stripe/Firebase durante um evento legítimo é temporária e precisa ser 5xx para
      // a Stripe tentar entregar novamente; responder 400 perderia a atualização da assinatura.
      console.error('[Billing webhook] Falha ao processar evento legítimo:', err?.message || err);
      return res.status(500).send('Falha temporária ao processar o webhook.');
    }
  });
}

export function registerBillingApi(app: Express) {
  app.use('/api/billing', (req, res, next) => {
    const origin = String(req.headers.origin || '');
    const configuredOrigins = env('OSONE_BILLING_ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean);
    const loopbackDesktop = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    let sameHost = false;
    try {
      const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      sameHost = !!origin && new URL(origin).host === requestHost;
    } catch { /* origem malformada continua recusada */ }
    const allowed = !origin || loopbackDesktop || sameHost || configuredOrigins.includes(origin);
    if (!allowed) return res.status(403).json({ error: 'Origem não autorizada para cobrança.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/billing/config', async (_req, res) => {
    const config = billingConfiguration();
    res.json({
      enabled: config.enabled,
      missing: config.enabled ? [] : config.missing,
      returnOrigin: config.returnOrigin,
      pixEnabled: config.enabled ? await pixAvailable() : false,
      planBillingConfigured: billingPlansConfigured(),
      plans: {
        plus: { monthly: 39.90, yearly: 339.90 },
        pro: { monthly: 69.90, yearly: 669.90 },
        max: { monthly: 119.90, yearly: 1199.90 }
      }
    });
  });

  app.get('/api/billing/status', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.json({
      plan: 'free', status: 'free', currentPeriodEnd: null, billingEnabled: false,
      configurationMissing: config.missing
    });
    try {
      const user = await authenticatedUser(req);
      const { db } = adminServices();
      const snapshot = await db.collection('entitlements').doc(user.uid).get();
      let data = snapshot.data() || {};
      if (data.billingMethod === 'card' && data.stripeSubscriptionId && data.plan !== 'free') {
        try {
          const subscription = await stripe().subscriptions.retrieve(String(data.stripeSubscriptionId));
          const entitlement = await subscriptionEntitlement(subscription);
          const { uid: _uid, ...freshData } = entitlement;
          await rememberCustomer(user.uid, subscription.customer);
          await db.collection('entitlements').doc(user.uid).set(freshData, { merge: true });
          data = freshData;
        } catch (err: any) {
          console.warn('[Billing] Não foi possível revalidar assinatura no status:', err?.message || err);
        }
      }
      const pixExpired = data.billingMethod === 'pix' && data.currentPeriodEnd && Date.parse(data.currentPeriodEnd) <= Date.now();
      const manualExpired = data.billingMethod === 'manual' && data.currentPeriodEnd && Date.parse(data.currentPeriodEnd) <= Date.now();
      const paidCard = data.billingMethod === 'card' && data.paid === true &&
        ACCESS_GRANTING_STATUSES.includes(data.status) && !pixExpired;
      const paidPix = data.billingMethod === 'pix' && data.paid === true && data.status === 'active' && !pixExpired;
      const manualGrant = data.billingMethod === 'manual' && data.manualGrant === true && data.status === 'active' && !manualExpired;
      const grantsPlan = PAID_PLAN_IDS.includes(data.plan) && (paidCard || paidPix || manualGrant);
      return res.json({
        plan: grantsPlan ? data.plan : 'free',
        status: grantsPlan ? data.status : 'free',
        currentPeriodEnd: grantsPlan ? data.currentPeriodEnd || null : null,
        billingMethod: grantsPlan ? data.billingMethod || (data.stripeSubscriptionId ? 'card' : null) : null,
        pixEnabled: await pixAvailable(),
        planBillingConfigured: billingPlansConfigured(),
        billingEnabled: true
      });
    } catch (err) { return sendError(res, err); }
  });

  app.post('/api/billing/checkout', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.status(503).json({ error: `Cobrança aguardando configuração do servidor: ${config.missing.join(', ')}.` });
    try {
      const user = await authenticatedUser(req);
      const plan = req.body?.plan as PaidPlanId;
      const interval = req.body?.interval as Interval;
      const paymentMethod = (req.body?.paymentMethod || 'card') as PaymentMethod;
      if (!PAID_PLAN_IDS.includes(plan) || !['month', 'year'].includes(interval)) {
        return res.status(400).json({ error: 'Plano ou período inválido.' });
      }
      if (!['card', 'pix'].includes(paymentMethod)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
      if (paymentMethod === 'pix' && !(await pixAvailable())) {
        return res.status(503).json({ error: 'O PIX ainda não foi liberado pela Stripe para esta conta. Use cartão enquanto a ativação está pendente.' });
      }
      // Preço e direito são conferidos ANTES de tocar no cliente da Stripe. Criar o cliente
      // primeiro fazia cada pedido recusado — Price ID trocado, PIX ainda válido — deixar para
      // trás um cliente sem pagamento nenhum, e um painel cheio desses clientes fantasma esconde
      // quantas pessoas de fato chegaram à página de pagamento.
      const returnUrl = env('OSONE_BILLING_RETURN_URL');
      const configuredPriceId = priceId(plan, interval);
      if (!configuredPriceId) {
        return res.status(503).json({ error: `Cobrança do plano ${plan.toUpperCase()} ${interval === 'month' ? 'mensal' : 'anual'} ainda não configurada na Stripe.` });
      }
      const configuredPrice = await stripe().prices.retrieve(configuredPriceId);
      validateStripePrice(configuredPrice, plan, interval);
      const { db } = adminServices();
      const entitlement = (await db.collection('entitlements').doc(user.uid).get()).data() || {};
      const hasActivePix = entitlement.billingMethod === 'pix' && entitlement.status === 'active' &&
        entitlement.currentPeriodEnd && Date.parse(entitlement.currentPeriodEnd) > Date.now();
      if (hasActivePix) {
        return res.status(409).json({ error: `Seu acesso por PIX está pago até ${new Date(entitlement.currentPeriodEnd).toLocaleDateString('pt-BR')}. Faça um novo pagamento somente após o vencimento.` });
      }
      const storedCustomer = await storedCustomerFor(user.uid);
      if (storedCustomer) {
        const { blocking, stale } = classifySubscriptions(await subscriptionsFor(storedCustomer));
        if (blocking.length) {
          return res.status(409).json({
            error: 'Esta conta já possui uma assinatura. Use “Gerenciar assinatura e cobrança” para trocar de plano ou período.'
          });
        }
        await cancelStaleSubscriptions(stale);
      }
      if (paymentMethod === 'pix') {
        const product = typeof configuredPrice.product === 'string' ? configuredPrice.product : configuredPrice.product.id;
        const session = await stripe().checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['pix'],
          ...(storedCustomer ? { customer: storedCustomer } : { customer_email: user.email, customer_creation: 'always' as const }),
          line_items: [{
            price_data: { currency: 'brl', unit_amount: EXPECTED_PRICE[plan][interval], product },
            quantity: 1
          }],
          success_url: billingResultUrl(returnUrl, 'success'),
          cancel_url: billingResultUrl(returnUrl, 'canceled'),
          client_reference_id: user.uid,
          metadata: { firebaseUid: user.uid, plan, interval, paymentMethod: 'pix' },
          payment_intent_data: { metadata: { firebaseUid: user.uid, plan, interval, paymentMethod: 'pix' } }
        });
        return res.json({ url: session.url });
      }
      const session = await stripe().checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        ...(storedCustomer ? { customer: storedCustomer } : { customer_email: user.email }),
        line_items: [{ price: configuredPrice.id, quantity: 1 }],
        success_url: billingResultUrl(returnUrl, 'success'),
        cancel_url: billingResultUrl(returnUrl, 'canceled'),
        client_reference_id: user.uid,
        metadata: { firebaseUid: user.uid, plan, interval, paymentMethod: 'card' },
        subscription_data: { metadata: { firebaseUid: user.uid, plan, interval } }
      });
      return res.json({ url: session.url });
    } catch (err) { return sendError(res, err); }
  });

  app.post('/api/billing/portal', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.status(503).json({ error: 'Cobrança ainda não configurada no servidor.' });
    try {
      const user = await authenticatedUser(req);
      const { db } = adminServices();
      const customerDoc = await db.collection('billingCustomers').doc(user.uid).get();
      const customer = customerDoc.data()?.stripeCustomerId;
      if (!customer) return res.status(404).json({ error: 'Esta conta ainda não possui uma assinatura.' });
      const session = await stripe().billingPortal.sessions.create({ customer, return_url: env('OSONE_BILLING_RETURN_URL') });
      return res.json({ url: session.url });
    } catch (err) { return sendError(res, err); }
  });
}
