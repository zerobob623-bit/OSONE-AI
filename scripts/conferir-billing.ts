import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import Stripe from 'stripe';
import handler from '../api/billing';
import { billingResultUrl, classifySubscriptions, invoiceConfirmsExpectedPayment, pixPeriodEnd, validatePixCheckout, validateStripePrice } from '../src/billingService';
import { abrirPagamento, type AmbienteDePagamento } from '../src/lib/abrirPagamento';
import { minimumPlanForFeature, OSONE_PLANS, paidFeatureForWorkspace, planHasFeature } from '../src/lib/planos';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

const REQUIRED_ENV = [
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_PLUS_MONTHLY',
  'STRIPE_PRICE_PLUS_YEARLY', 'STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO_YEARLY',
  'STRIPE_PRICE_MAX_MONTHLY', 'STRIPE_PRICE_MAX_YEARLY',
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
  assert.equal(directData.plans.max.monthly, 119.90);
  assert.equal(directData.plans.max.yearly, 1199.90);
  assert.equal(directData.pixEnabled, false);
  assert.equal(directData.planBillingConfigured.max, false);
  console.log('  ok  função isolada responde à rota direta com os seis preços');

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
  assert.deepEqual(configured.planBillingConfigured, { plus: true, pro: true, max: false });
  console.log('  ok  configuração completa habilita Plus/Pro sem exigir Max ainda');

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
  validateStripePrice({
    active: true, currency: 'brl', unit_amount: 11990, type: 'recurring',
    recurring: { interval: 'month', interval_count: 1 } as any
  }, 'max', 'month');
  console.log('  ok  valor, moeda e periodicidade divergentes bloqueiam o Checkout');

  validatePixCheckout({ mode: 'payment', payment_status: 'paid', currency: 'brl', amount_total: 3990 }, 'plus', 'month');
  assert.throws(() => validatePixCheckout({ mode: 'payment', payment_status: 'unpaid', currency: 'brl', amount_total: 3990 }, 'plus', 'month'));
  assert.throws(() => validatePixCheckout({ mode: 'payment', payment_status: 'paid', currency: 'brl', amount_total: 6990 }, 'plus', 'month'));
  assert.equal(pixPeriodEnd(new Date('2026-08-08T12:00:00Z'), 'month').toISOString(), '2026-09-08T12:00:00.000Z');
  assert.equal(pixPeriodEnd(new Date('2026-08-08T12:00:00Z'), 'year').toISOString(), '2027-08-08T12:00:00.000Z');
  console.log('  ok  PIX só libera após confirmação, no valor exato, por um mês ou um ano');

  const faturaPlusMensal = (overrides: Record<string, unknown> = {}) => ({
    status: 'paid',
    paid: true,
    currency: 'brl',
    amount_paid: 3990,
    lines: { data: [{ price: { id: 'price_plus_month' } }] },
    ...overrides
  }) as any;
  assert.equal(invoiceConfirmsExpectedPayment(faturaPlusMensal(), 'plus', 'month', 'price_plus_month'), true);
  assert.equal(invoiceConfirmsExpectedPayment(faturaPlusMensal({ amount_paid: 0 }), 'plus', 'month', 'price_plus_month'), false);
  assert.equal(invoiceConfirmsExpectedPayment(faturaPlusMensal({ amount_paid: 2000 }), 'plus', 'month', 'price_plus_month'), false);
  assert.equal(invoiceConfirmsExpectedPayment(faturaPlusMensal({ currency: 'usd' }), 'plus', 'month', 'price_plus_month'), false);
  assert.equal(invoiceConfirmsExpectedPayment(faturaPlusMensal({ lines: { data: [{ price: { id: 'price_errado' } }] } }), 'plus', 'month', 'price_plus_month'), false);
  console.log('  ok  cartão só libera plano com fatura paga, BRL, preço certo e sem cobrança zerada');

  // Cartão recusado na primeira cobrança deixava uma assinatura `incomplete` que era lida como
  // assinatura válida: o cliente recebia 409 para sempre e nunca chegava a pagar.
  const semAssinatura = classifySubscriptions([]);
  assert.deepEqual(semAssinatura, { blocking: [], stale: [] });
  const primeiraTentativaRecusada = classifySubscriptions([{ id: 'sub_incompleta', status: 'incomplete' }]);
  assert.deepEqual(primeiraTentativaRecusada.blocking, []);
  assert.deepEqual(primeiraTentativaRecusada.stale, ['sub_incompleta']);
  for (const status of ['active', 'past_due'] as const) {
    const emDia = classifySubscriptions([{ id: `sub_${status}`, status }]);
    assert.deepEqual(emDia.blocking, [`sub_${status}`], `${status} deve continuar impedindo Checkout duplicado`);
    assert.deepEqual(emDia.stale, []);
  }
  for (const status of ['canceled'] as const) {
    assert.deepEqual(classifySubscriptions([{ id: 'sub_encerrada', status }]), { blocking: [], stale: [] });
  }
  assert.deepEqual(classifySubscriptions([{ id: 'sub_teste_gratis', status: 'trialing' }]).stale, ['sub_teste_gratis']);
  assert.deepEqual(classifySubscriptions([{ id: 'sub_expirada', status: 'incomplete_expired' }]).stale, ['sub_expirada']);
  assert.deepEqual(classifySubscriptions([{ id: 'sub_sem_pagamento', status: 'unpaid' }]).stale, ['sub_sem_pagamento']);
  const contaComHistorico = classifySubscriptions([
    { id: 'sub_incompleta', status: 'incomplete' },
    { id: 'sub_ativa', status: 'active' },
    { id: 'sub_antiga', status: 'canceled' }
  ]);
  assert.deepEqual(contaComHistorico.blocking, ['sub_ativa']);
  assert.deepEqual(contaComHistorico.stale, ['sub_incompleta']);
  console.log('  ok  pagamento recusado não tranca a conta, e assinatura ativa segue sem duplicar');

  // O app instalado manda o link para o navegador do sistema e o `window.open` devolve `null`.
  // Ler isso como pop-up bloqueado avisava que o pagamento tinha falhado bem quando ele abria.
  const UA_APP = 'Mozilla/5.0 OSONE/1.5.1 Chrome/126 Electron/31.0.0 Safari/537.36';
  const UA_SITE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
  const ambiente = (userAgent: string, janela: { opener: unknown } | null): AmbienteDePagamento & { navegou: string[] } => {
    const registro: string[] = [];
    return {
      userAgent,
      abrirAba: () => janela,
      navegarNaAba: url => { registro.push(url); },
      navegou: registro
    };
  };
  const CHECKOUT = 'https://checkout.stripe.com/c/pay/cs_test_conferidor';

  const noApp = ambiente(UA_APP, null);
  assert.equal(abrirPagamento(CHECKOUT, noApp), 'navegador-do-sistema');
  assert.deepEqual(noApp.navegou, [], 'o app instalado não pode sair da própria tela');

  const noSite = ambiente(UA_SITE, null);
  assert.equal(abrirPagamento(CHECKOUT, noSite), 'mesma-aba');
  assert.deepEqual(noSite.navegou, [CHECKOUT], 'pop-up barrado no site precisa virar navegação na própria aba');

  const janelaAberta: { opener: unknown } = { opener: 'janela-que-abriu' };
  const comPopup = ambiente(UA_SITE, janelaAberta);
  assert.equal(abrirPagamento(CHECKOUT, comPopup), 'aba-nova');
  assert.deepEqual(comPopup.navegou, [], 'com pop-up liberado o app continua aberto atrás');
  assert.equal(janelaAberta.opener, null, 'a página de pagamento não pode manter acesso à janela que a abriu');
  console.log('  ok  página de pagamento abre no app, no site e no APK sem falso "pop-up bloqueado"');

  assert.equal(OSONE_PLANS.plus.monthlyPrice, 39.90);
  assert.equal(OSONE_PLANS.plus.yearlyPrice, 339.90);
  assert.equal(OSONE_PLANS.pro.monthlyPrice, 69.90);
  assert.equal(OSONE_PLANS.pro.yearlyPrice, 669.90);
  assert.equal(OSONE_PLANS.max.monthlyPrice, 119.90);
  assert.equal(OSONE_PLANS.max.yearlyPrice, 1199.90);
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
  assert.equal(planHasFeature('max', 'hear'), true);
  assert.equal(planHasFeature('max', 'cowork_browser'), true);
  assert.equal(planHasFeature('max', 'whatsapp'), true);
  assert.equal(planHasFeature('max', 'osone_code'), true);
  assert.equal(planHasFeature('max', 'agentic_research'), true);
  assert.equal(minimumPlanForFeature('osone_code'), 'pro');
  assert.equal(minimumPlanForFeature('agentic_research'), 'max');
  assert.equal(paidFeatureForWorkspace('code'), 'osone_code');
  assert.equal(paidFeatureForWorkspace('research'), 'agentic_research');
  assert.equal(paidFeatureForWorkspace('writing'), null);
  assert.ok(OSONE_PLANS.max.details.length >= 2);
  console.log('  ok  matriz de recursos Grátis, Plus, Pro e Max corresponde ao combinado');

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

console.log('21/21 grupos de conferências de cobrança passaram.');
