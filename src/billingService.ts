import express, { type Express, type Request } from 'express';
import Stripe from 'stripe';
import { applicationDefault, cert, getApps, initializeApp, type App as FirebaseAdminApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

type PlanId = 'free' | 'plus' | 'pro';
type Interval = 'month' | 'year';

const PRICE_ENV: Record<Exclude<PlanId, 'free'>, Record<Interval, string>> = {
  plus: { month: 'STRIPE_PRICE_PLUS_MONTHLY', year: 'STRIPE_PRICE_PLUS_YEARLY' },
  pro: { month: 'STRIPE_PRICE_PRO_MONTHLY', year: 'STRIPE_PRICE_PRO_YEARLY' }
};

let stripeClient: Stripe | null = null;
let firebaseApp: FirebaseAdminApp | null = null;
let firestore: Firestore | null = null;

function env(name: string): string { return String(process.env[name] || '').trim(); }

function billingConfiguration() {
  const missing = [
    'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PLUS_MONTHLY',
    'STRIPE_PRICE_PLUS_YEARLY', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY',
    'OSONE_BILLING_RETURN_URL'
  ].filter(name => !env(name));
  const firebaseConfigured = !!(env('FIREBASE_SERVICE_ACCOUNT_JSON') || env('GOOGLE_APPLICATION_CREDENTIALS'));
  if (!firebaseConfigured) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON ou GOOGLE_APPLICATION_CREDENTIALS');
  return { enabled: missing.length === 0, missing };
}

function stripe(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(env('STRIPE_SECRET_KEY'));
  return stripeClient;
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

function planFromPrice(price: string | null | undefined): PlanId {
  if (!price) return 'free';
  if ([priceId('pro', 'month'), priceId('pro', 'year')].includes(price)) return 'pro';
  if ([priceId('plus', 'month'), priceId('plus', 'year')].includes(price)) return 'plus';
  return 'free';
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

async function writeEntitlement(subscription: Stripe.Subscription) {
  const uid = subscription.metadata?.firebaseUid;
  if (!uid) throw new Error(`Assinatura ${subscription.id} sem firebaseUid.`);
  const firstItem = subscription.items.data[0];
  const plan = planFromPrice(firstItem?.price?.id);
  const grantsAccess = ['active', 'trialing', 'past_due'].includes(subscription.status);
  const periodEnd = firstItem?.current_period_end ? new Date(firstItem.current_period_end * 1000).toISOString() : null;
  const { db } = adminServices();
  await db.collection('entitlements').doc(uid).set({
    plan: grantsAccess ? plan : 'free',
    status: subscription.status,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
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
      const { db } = adminServices();
      const eventRef = db.collection('billingEvents').doc(event.id);
      if ((await eventRef.get()).exists) return res.json({ received: true, duplicate: true });

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subscription = await stripe().subscriptions.retrieve(String(session.subscription));
          await writeEntitlement(subscription);
        }
      } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        await writeEntitlement(event.data.object as Stripe.Subscription);
      }

      await eventRef.set({ type: event.type, processedAt: FieldValue.serverTimestamp() });
      return res.json({ received: true });
    } catch (err: any) {
      console.error('[Billing webhook]', err);
      return res.status(400).send(`Webhook recusado: ${err?.message || 'evento inválido'}`);
    }
  });
}

export function registerBillingApi(app: Express) {
  app.use('/api/billing', (req, res, next) => {
    const origin = String(req.headers.origin || '');
    const configuredOrigins = env('OSONE_BILLING_ALLOWED_ORIGINS').split(',').map(value => value.trim()).filter(Boolean);
    const loopbackDesktop = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowed = !origin || loopbackDesktop || configuredOrigins.includes(origin);
    if (!allowed) return res.status(403).json({ error: 'Origem não autorizada para cobrança.' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/billing/config', (_req, res) => {
    const config = billingConfiguration();
    res.json({ enabled: config.enabled, plans: { plus: { monthly: 39.90, yearly: 339.90 }, pro: { monthly: 69.90, yearly: 669.90 } } });
  });

  app.get('/api/billing/status', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.json({ plan: 'free', status: 'free', currentPeriodEnd: null, billingEnabled: false });
    try {
      const user = await authenticatedUser(req);
      const { db } = adminServices();
      const snapshot = await db.collection('entitlements').doc(user.uid).get();
      const data = snapshot.data() || {};
      return res.json({ plan: data.plan || 'free', status: data.status || 'free', currentPeriodEnd: data.currentPeriodEnd || null, billingEnabled: true });
    } catch (err) { return sendError(res, err); }
  });

  app.post('/api/billing/checkout', async (req, res) => {
    const config = billingConfiguration();
    if (!config.enabled) return res.status(503).json({ error: `Cobrança aguardando configuração do servidor: ${config.missing.join(', ')}.` });
    try {
      const user = await authenticatedUser(req);
      const plan = req.body?.plan as Exclude<PlanId, 'free'>;
      const interval = req.body?.interval as Interval;
      if (!['plus', 'pro'].includes(plan) || !['month', 'year'].includes(interval)) {
        return res.status(400).json({ error: 'Plano ou período inválido.' });
      }
      const customer = await customerFor(user.uid, user.email, user.name);
      const returnUrl = env('OSONE_BILLING_RETURN_URL');
      const session = await stripe().checkout.sessions.create({
        mode: 'subscription',
        customer,
        line_items: [{ price: priceId(plan, interval), quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}billing=success`,
        cancel_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}billing=canceled`,
        client_reference_id: user.uid,
        metadata: { firebaseUid: user.uid, plan, interval },
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
