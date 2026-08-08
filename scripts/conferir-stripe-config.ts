import 'dotenv/config';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { validateStripePrice } from '../src/billingService';

type PaidPlan = 'plus' | 'pro';
type Interval = 'month' | 'year';

const required = (name: string): string => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} no ambiente local.`);
  return value;
};

const secretKey = required('STRIPE_SECRET_KEY');
const stripe = new Stripe(secretKey);
const prices: Array<{ plan: PaidPlan; interval: Interval; env: string }> = [
  { plan: 'plus', interval: 'month', env: 'STRIPE_PRICE_PLUS_MONTHLY' },
  { plan: 'plus', interval: 'year', env: 'STRIPE_PRICE_PLUS_YEARLY' },
  { plan: 'pro', interval: 'month', env: 'STRIPE_PRICE_PRO_MONTHLY' },
  { plan: 'pro', interval: 'year', env: 'STRIPE_PRICE_PRO_YEARLY' }
];

for (const item of prices) {
  const price = await stripe.prices.retrieve(required(item.env));
  validateStripePrice(price, item.plan, item.interval);
  console.log(`  ok  ${item.plan.toUpperCase()} ${item.interval === 'month' ? 'mensal' : 'anual'}: ativo, BRL, valor e recorrência corretos`);
}

const returnUrl = new URL(required('OSONE_BILLING_RETURN_URL'));
const webhookUrl = `${returnUrl.origin}/api/billing/webhook`;
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find(item => item.url.replace(/\/$/, '') === webhookUrl);
assert.ok(endpoint, `Não existe webhook Stripe apontando para ${webhookUrl}.`);
assert.equal(endpoint.status, 'enabled', 'O webhook existe, mas está desativado.');
const requiredEvents = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
];
const allEvents = endpoint.enabled_events.includes('*');
for (const event of requiredEvents) {
  assert.ok(allEvents || endpoint.enabled_events.includes(event as Stripe.WebhookEndpointCreateParams.EnabledEvent),
    `O webhook não está ouvindo ${event}.`);
}
console.log('  ok  webhook ativo no endereço certo e ouvindo assinatura e confirmação assíncrona do PIX');

const portalConfigurations = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
const portalSummary = portalConfigurations.data.find(config =>
  config.features.subscription_cancel.enabled &&
  config.features.payment_method_update.enabled &&
  config.features.invoice_history.enabled &&
  config.features.subscription_update.enabled
);
assert.ok(portalSummary, 'Nenhuma configuração ativa do Portal permite atualizar pagamento, ver faturas, cancelar e trocar o plano.');

// A Stripe deixa esta coleção recolhida por padrão e devolve `[]` mesmo quando está configurada.
// Sem expand, o conferidor acusaria falsamente que nenhum preço entrou no Portal.
const portal = await stripe.billingPortal.configurations.retrieve(portalSummary.id, {
  expand: ['features.subscription_update.products']
});

const portalPriceIds = new Set(
  (portal.features.subscription_update.products || []).flatMap(product => product.prices)
);
for (const item of prices) {
  assert.ok(portalPriceIds.has(required(item.env)), `O Portal não inclui ${item.plan.toUpperCase()} ${item.interval}.`);
}
console.log('  ok  Portal permite pagamento, faturas, cancelamento e troca entre os quatro preços');

const paymentMethods = await stripe.paymentMethodConfigurations.list({ active: true, limit: 100 });
const pix = paymentMethods.data[0]?.pix;
console.log(pix?.available && pix.display_preference?.value === 'on'
  ? '  ok  PIX de pagamento único disponível e ativado'
  : '  aviso  PIX ainda indisponível na conta; o app manterá o botão bloqueado');

console.log(`6/6 grupos da configuração Stripe passaram (${secretKey.startsWith('sk_live_') ? 'modo produção' : 'modo teste'}; somente leitura).`);
