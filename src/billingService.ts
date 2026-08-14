import express, { type Express, type Request } from 'express';
import Stripe from 'stripe';
import { applicationDefault, cert, getApps, initializeApp, type App as FirebaseAdminApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

type PlanId = 'free' | 'plus' | 'pro';
type Interval = 'month' | 'year';
type PaymentMethod = 'card' | 'pix';

const PRICE_ENV: Record<Exclude<PlanId, 'free'>, Record<Interval, string>> = {
  plus: { month: 'STRIPE_PRICE_PLUS_MONTHLY', year: 'STRIPE_PRICE_PLUS_YEARLY' },
  pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_YEARLY' }
};

const EXPECTED_PRICE: Record<Exclude<PlanId, 'free'>, Record<Interval, number>> = {
  plus: { month: 3990, year: 33990 },
  pro: { month: 6990, year: 66990 }
};

let stripeClient: Stripe | null = null;
let firebaseApp: FirebaseAdminApp | null = null;
let firestore: Firestore | null = null;
let pixAvailabilityCache: { value: boolean; expiresAt: number } | null = null;

/** As únicas situações em que a assinatura já foi paga o bastante para liberar o plano. */
const ACCESS_GRANTING_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

/** Tentativas mortas: não liberam nada e não voltam a cobrar sozinhas. */
const STALE_STATUSES: Stripe.Subscription.Status[] = ['incomplete', 'unpaid'];

const BILLING_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
]);

function env(name: string): string { return String(process.env[name] || '').trim(); }

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
  return getAuth(app).verifyIdToken(header.slice(7));
}

function priceId(plan: Exclude<PlanId, 'free'>, interval: Interval): string {
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
  plan: Exclude<PlanId, 'free'>,
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
  if ([priceId('pro', 'month'), priceId('pro', 'year')].includes(price)) return 'pro';
  if ([priceId('plus', 'month'), priceId('plus', 'year')].includes(price)) return 'plus';
  return 'free';
}

export function pixPeriodEnd(start: Date, interval: Interval): Date {
  const end = new Date(start);
  if (interval === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return end;
}

export function validatePixCheckout(
  session: Pick<Stripe.Checkout.Session, 'mode' | 'payment_status' | 'currency' | 'amount_total'>,
  plan: Exclude<PlanId, 'free'>,
  interval: Interval
) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid' ||
      session.currency?.toLowerCase() !== 'brl' || session.amount_total !== EXPECTED_PRICE[plan][interval]) {
    throw new Error('Pagamento PIX não confirmado ou com valor divergente; acesso não liberado.');
  }
}

async function customerFor(uid: string, email?: string, name?: string): Promise<string> {
  const { db } = adminServices();
  const ref = db.collection('billingCustomers').doc(uid);
  const stored = await ref.get();
  const existingId = stored.data()?.stripeCustomerId;
  if (existingId) return existingId;
  const customer = await stripe().customers.create({ email, name, metadata: { firebaseUid: uid } });
  await ref.set({ stripeCustomerId: customer.id, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  return customer.id;
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

async function writeEntitlement(subscription: Stripe.Subscription) {
  const uid = subscription.metadata?.firebaseUid;
  if (!uid) throw new Error(`Assinatura ${subscription.id} sem firebaseUid.`);
  const firstItem = subscription.items.data[0];
  const plan = planFromPrice(firstItem?.price?.id);
  const grantsAccess = ACCESS_GRANTING_STATUSES.includes(subscription.status);
  const periodEnd = firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000).toISOString() : null;
  const { db } = adminServices();
  await db.collection('entitlements').doc(uid).set({
    plan: grantsAccess ? plan : 'free',
    status: subscription.status,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    billingMethod: 'card',
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function writePixEntitlement(session: Stripe.Checkout.Session) {
  const uid = session.metadata?.firebaseUid;
  const plan = session.metadata?.plan as Exclude<PlanId, 'free'>;
  const interval = session.metadata?.interval as Interval;
  if (!uid || !['plus', 'pro'].includes(plan) || !['month', 'year'].includes(interval) || session.metadata?.paymentMethod !== 'pix') {
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
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      stripeCheckoutSessionId: session.id,
      stripeSubscriptionId: FieldValue.delete(),
      cancelAtPeriodEnd: true,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    transaction.create(purchaseRef, {
      uid, plan, interval, amount: session.amount_total, currency: session.currency,
      currentPeriodEnd, processedAt: FieldValue.serverTimestamp()
    });
  });
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
      plans: { plus: { monthly: 39.90, yearly: 339.90 }, pro: { monthly: 69.90, yearly: 669.90 } }
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
      const data = snapshot.data() || {};
      const pixExpired = data.billingMethod === 'pix' && data.currentPeriodEnd && Date.parse(data.currentPeriodEnd) <= Date.now();
      return res.json({
        plan: pixExpired ? 'free' : data.plan || 'free',
        status: pixExpired ? 'free' : data.status || 'free',
        currentPeriodEnd: data.currentPeriodEnd || null,
        billingMethod: pixExpired ? null : data.billingMethod || (data.stripeSubscriptionId ? 'card' : null),
        pixEnabled: await pixAvailable(),
        billingEnabled: true
      });
    } catch (err) { return sendError(res, err); }
  });

  app.post('/api/billing/checkout', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.status(503).json({ error: `Cobrança aguardando configuração do servidor: ${config.missing.join(', ')}.` });
    try {
      const user = await authenticatedUser(req);
      const plan = req.body?.plan as Exclude<PlanId, 'free'>;
      const interval = req.body?.interval as Interval;
      const paymentMethod = (req.body?.paymentMethod || 'card') as PaymentMethod;
      if (!['plus', 'pro'].includes(plan) || !['month', 'year'].includes(interval)) {
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
      const configuredPrice = await stripe().prices.retrieve(priceId(plan, interval));
      validateStripePrice(configuredPrice, plan, interval);
      const { db } = adminServices();
      const entitlement = (await db.collection('entitlements').doc(user.uid).get()).data() || {};
      const hasActivePix = entitlement.billingMethod === 'pix' && entitlement.status === 'active' &&
        entitlement.currentPeriodEnd && Date.parse(entitlement.currentPeriodEnd) > Date.now();
      if (hasActivePix) {
        return res.status(409).json({ error: `Seu acesso por PIX está pago até ${new Date(entitlement.currentPeriodEnd).toLocaleDateString('pt-BR')}. Faça um novo pagamento somente após o vencimento.` });
      }
      const customer = await customerFor(user.uid, user.email, user.name);
      const { blocking, stale } = classifySubscriptions(await subscriptionsFor(customer));
      if (blocking.length) {
        return res.status(409).json({
          error: 'Esta conta já possui uma assinatura. Use “Gerenciar assinatura e cobrança” para trocar de plano ou período.'
        });
      }
      await cancelStaleSubscriptions(stale);
      if (paymentMethod === 'pix') {
        const product = typeof configuredPrice.product === 'string' ? configuredPrice.product : configuredPrice.product.id;
        const session = await stripe().checkout.sessions.create({
          mode: 'payment',
          payment_method_types: ['pix'],
          customer,
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
        customer,
        line_items: [{ price: configuredPrice.id, quantity: 1 }],
        allow_promotion_codes: true,
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
