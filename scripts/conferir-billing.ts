import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Stripe from 'stripe';
import handler from '../api/billing';
import { billingResultUrl, pixPeriodEnd, validatePixCheckout, validateStripePrice } from '../src/billingService';
import { minimumPlanForFeature, OSONE_PLANS, paidFeatureForWorkspace, planHasFeature } from '../src/lib/planos';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PLUS_MONTHLY',
  'STRIPE_PRICE_PLUS_YEARLY', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY',
  'OSONE_BILLING_RETURN_URL', 'FIREBASE_SERVICE_ACCOUNT_JSON', 'GOOGLE_APPLICATION_CREDENTIALS'
];
for (const name of REQUIRED_ENV) delete process.env[name];
process.env.VERCEL = '1';

const server = http.createServer((req, res) => handler(req, res));
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Porta de teste não foi aberta.');
const base = `http://127.0.0.1:${address.port}`;

try {
  const direct = await fetch(`${base}/api/billing/config`);
  const directData: any = await direct.json();
  assert.equal(direct.status, 200);
  assert.equal(directData.plans.plus.monthly, 39.90);
  assert.equal(directData.plans.plus.yearly, 339.90);
  assert.equal(directData.plans.pro.monthly, 69.90);
  assert.equal(directData.plans.pro.yearly, 669.90);
  assert.equal(directData.pixEnabled, false);
  console.log('  ok  função isolada responde à rota direta com os quatro preços');

  const rewritten = await fetch(`${base}/api/billing?path=config`);
  const rewrittenData: any = await rewritten.json();
  assert.equal(rewritten.status, 200);
  assert.deepEqual(rewrittenData.plans, directData.plans);
  console.log('  ok  rewrite da Vercel chega à mesma configuração');

  const preflight = await fetch(`${base}/api/billing/status`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://127.0.0.1:3000' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3000');
  console.log('  ok  app desktop recebe autorização CORS para consultar a assinatura');

  assert.ok(Array.isArray(directData.missing));
  console.log('  ok  configuração incompleta é diagnosticada sem derrubar a função');

  process.env.STRIPE_SECRET_KEY = 'sk_test_conferidor';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_conferidor';
  process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_plus_month';
  process.env.STRIPE_PRICE_PLUS_YEARLY = 'price_plus_year';
  process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_month';
  process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_year';
  process.env.OSONE_BILLING_RETURN_URL = 'https://osone.example';
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'JSON quebrado de propósito';

  const invalidFirebase = await (await fetch(`${base}/api/billing/config`)).json() as any;
  assert.equal(invalidFirebase.enabled, false);
  assert.ok(invalidFirebase.missing.includes('FIREBASE_SERVICE_ACCOUNT_JSON válido'));
  console.log('  ok  credencial Firebase quebrada bloqueia a cobrança antes do pagamento');

  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: 'osone-test', client_email: 'billing@osone-test.iam.gserviceaccount.com', private_key: 'dummy'
  });
  process.env.OSONE_BILLING_RETURN_URL = 'http://pagamento-inseguro.example';
  const invalidReturn = await (await fetch(`${base}/api/billing/config`)).json() as any;
  assert.equal(invalidReturn.enabled, false);
  assert.ok(invalidReturn.missing.includes('OSONE_BILLING_RETURN_URL HTTPS válida'));
  console.log('  ok  retorno sem HTTPS bloqueia a abertura do Checkout');

  process.env.OSONE_BILLING_RETURN_URL = 'https://osone.example';
  const configured = await (await fetch(`${base}/api/billing/config`)).json() as any;
  assert.equal(configured.enabled, true);
  assert.deepEqual(configured.missing, []);
  assert.equal(configured.returnOrigin, 'https://osone.example');
  console.log('  ok  configuração completa habilita a cobrança sem expor segredos');

  const noToken = await fetch(`${base}/api/billing/status`);
  assert.equal(noToken.status, 401);
  console.log('  ok  situação da assinatura exige Firebase ID Token');

  const missingSignature = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(missingSignature.status, 400);
  const invalidSignature = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 'assinatura-adulterada' },
    body: '{}'
  });
  assert.equal(invalidSignature.status, 400);
  console.log('  ok  webhook ausente ou adulterado é recusado');

  const harmlessPayload = JSON.stringify({
    id: 'evt_conferidor', object: 'event', type: 'customer.created',
    data: { object: { id: 'cus_conferidor' } }
  });
  const validHeader = Stripe.webhooks.generateTestHeaderString({
    payload: harmlessPayload, secret: process.env.STRIPE_WEBHOOK_SECRET
  });
  const validIgnoredEvent = await fetch(`${base}/api/billing/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': validHeader },
    body: harmlessPayload
  });
  assert.equal(validIgnoredEvent.status, 200);
  assert.equal((await validIgnoredEvent.json() as any).ignored, true);
  console.log('  ok  assinatura Stripe válida é reconhecida sobre os bytes crus do webhook');

  const forbiddenOrigin = await fetch(`${base}/api/billing/config`, {
    headers: { Origin: 'https://site-malicioso.example' }
  });
  assert.equal(forbiddenOrigin.status, 403);
  console.log('  ok  origem não autorizada não acessa a API de cobrança');

  const sameOrigin = await fetch(`${base}/api/billing/config`, {
    headers: { Origin: 'https://osone.example', 'x-forwarded-host': 'osone.example' }
  });
  assert.equal(sameOrigin.status, 200);
  assert.equal(sameOrigin.headers.get('access-control-allow-origin'), 'https://osone.example');
  console.log('  ok  site e APK hospedados na própria origem são aceitos automaticamente');

  validateStripePrice({
    active: true, currency: 'brl', unit_amount: 3990, type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 } as any
  }, 'plus', 'month');
  assert.throws(() => validateStripePrice({
    active: true, currency: 'brl', unit_amount: 6990, type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 } as any
  }, 'plus', 'month'), /pagamento foi bloqueado/i);
  assert.throws(() => validateStripePrice({
    active: true, currency: 'usd', unit_amount: 3990, type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 } as any
  }, 'plus', 'month'), /pagamento foi bloqueado/i);
  assert.throws(() => validateStripePrice({
    active: true, currency: 'brl', unit_amount: 33990, type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 } as any
  }, 'plus', 'year'), /pagamento foi bloqueado/i);
  console.log('  ok  valor, moeda e periodicidade divergentes bloqueiam o Checkout');

  validatePixCheckout({ mode: 'payment', payment_status: 'paid', currency: 'brl', amount_total: 3990 }, 'plus', 'month');
  assert.throws(() => validatePixCheckout({ mode: 'payment', payment_status: 'unpaid', currency: 'brl', amount_total: 3990 }, 'plus', 'month'));
  assert.throws(() => validatePixCheckout({ mode: 'payment', payment_status: 'paid', currency: 'brl', amount_total: 6990 }, 'plus', 'month'));
  assert.equal(pixPeriodEnd(new Date('2026-08-08T12:00:00Z'), 'month').toISOString(), '2026-09-08T12:00:00.000Z');
  assert.equal(pixPeriodEnd(new Date('2026-08-08T12:00:00Z'), 'year').toISOString(), '2027-08-08T12:00:00.000Z');
  console.log('  ok  PIX só libera após confirmação, no valor exato, por um mês ou um ano');

  assert.equal(OSONE_PLANS.plus.monthlyPrice, 39.90);
  assert.equal(OSONE_PLANS.plus.yearlyPrice, 339.90);
  assert.equal(OSONE_PLANS.pro.monthlyPrice, 69.90);
  assert.equal(OSONE_PLANS.pro.yearlyPrice, 669.90);
  assert.equal(planHasFeature('free', 'hear'), false);
  assert.equal(planHasFeature('free', 'cowork_browser'), false);
  assert.equal(planHasFeature('free', 'whatsapp'), false);
  assert.equal(planHasFeature('free', 'osone_code'), false);
  assert.equal(planHasFeature('plus', 'hear'), true);
  assert.equal(planHasFeature('plus', 'cowork_browser'), true);
  assert.equal(planHasFeature('plus', 'whatsapp'), false);
  assert.equal(planHasFeature('plus', 'osone_code'), false);
  assert.equal(planHasFeature('pro', 'hear'), true);
  assert.equal(planHasFeature('pro', 'cowork_browser'), true);
  assert.equal(planHasFeature('pro', 'whatsapp'), true);
  assert.equal(planHasFeature('pro', 'osone_code'), true);
  assert.equal(minimumPlanForFeature('osone_code'), 'pro');
  assert.equal(paidFeatureForWorkspace('code'), 'osone_code');
  assert.equal(paidFeatureForWorkspace('writing'), null);
  console.log('  ok  matriz de recursos Grátis, Plus e Pro corresponde ao combinado');

  assert.equal(
    billingResultUrl('https://osone.example/app?origem=desktop#planos', 'success'),
    'https://osone.example/app?origem=desktop&billing=success#planos'
  );
  assert.equal(
    billingResultUrl('https://osone.example/app#planos', 'canceled'),
    'https://osone.example/app?billing=canceled#planos'
  );
  console.log('  ok  retorno do Checkout preserva query e fragmento sem perder o resultado');

  const rules = fs.readFileSync(path.join(PROJECT_ROOT, 'firestore.rules'), 'utf8');
  assert.match(rules, /match \/entitlements\/\{userId\}[\s\S]*allow read:[\s\S]*request\.auth\.uid == userId;[\s\S]*allow write: if false;/);
  assert.match(rules, /match \/billingCustomers\/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  assert.match(rules, /match \/billingEvents\/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  console.log('  ok  cliente pode ler apenas o próprio plano e não pode se promover');

  const vercel = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.rewrites[0].source, '/api/billing/:path*');
  assert.equal(vercel.rewrites[0].destination, '/api/billing');
  assert.equal(vercel.rewrites[1].source, '/api/:path*');
  console.log('  ok  rota isolada de cobrança tem prioridade sobre o servidor geral na Vercel');
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
}

console.log('18/18 grupos de conferências de cobrança passaram.');
