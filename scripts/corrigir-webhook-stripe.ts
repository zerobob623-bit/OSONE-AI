import 'dotenv/config';
import Stripe from 'stripe';

const required = (name: string): string => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta ${name} no ambiente.`);
  return value;
};

const stripe = new Stripe(required('STRIPE_SECRET_KEY'));
const returnUrl = new URL(required('OSONE_BILLING_RETURN_URL'));
const webhookUrl = `${returnUrl.origin}/api/billing/webhook`;
const requiredEvents = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'invoice.paid',
  'invoice.payment_succeeded',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];

const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find(item => item.url.replace(/\/$/, '') === webhookUrl);
if (!endpoint) throw new Error(`Não existe webhook Stripe apontando para ${webhookUrl}.`);

const currentEvents = endpoint.enabled_events.includes('*') ? requiredEvents : endpoint.enabled_events;
const nextEvents = [...new Set([...currentEvents, ...requiredEvents])] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[];

if (endpoint.enabled_events.includes('*') || requiredEvents.every(event => endpoint.enabled_events.includes(event))) {
  console.log(`Webhook ${endpoint.id} já está correto: ${webhookUrl}`);
} else {
  await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: nextEvents });
  console.log(`Webhook ${endpoint.id} atualizado: ${webhookUrl}`);
  console.log(`Eventos adicionados: ${requiredEvents.filter(event => !endpoint.enabled_events.includes(event)).join(', ')}`);
}
