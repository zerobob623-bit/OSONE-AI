import 'dotenv/config';
import Stripe from 'stripe';

const args = new Set(process.argv.slice(2));
const shouldDelete = args.has('--delete');
const confirmLiveDelete = args.has('--confirm-live-delete');
const maxAgeHours = Number(process.argv.find(arg => arg.startsWith('--min-age-hours='))?.split('=')[1] || 24);
const maxCustomers = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 100);

const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
if (!secretKey) throw new Error('Falta STRIPE_SECRET_KEY no ambiente.');

const stripe = new Stripe(secretKey);
const liveMode = secretKey.startsWith('sk_live_');
const nowSeconds = Math.floor(Date.now() / 1000);
const minAgeSeconds = Math.max(1, maxAgeHours) * 60 * 60;
const liveStatuses = new Set(['active', 'past_due', 'trialing']);

if (shouldDelete && liveMode && !confirmLiveDelete) {
  throw new Error('Modo live detectado. Para apagar clientes reais, rode novamente com --delete --confirm-live-delete.');
}

type CustomerAudit = {
  id: string;
  email: string;
  created: string;
  ghost: boolean;
  reason: string;
  subscriptions: number;
  paidInvoices: number;
  positiveCharges: number;
  deleted?: boolean;
};

async function listAll<T>(
  firstPage: Promise<Stripe.ApiList<T>>,
  nextPage: (startingAfter: string) => Promise<Stripe.ApiList<T>>,
  limit = 100
): Promise<T[]> {
  const out: T[] = [];
  let page = await firstPage;
  for (;;) {
    out.push(...page.data);
    if (out.length >= limit || !page.has_more) return out.slice(0, limit);
    const last: any = page.data[page.data.length - 1];
    page = await nextPage(last.id);
  }
}

async function auditCustomer(customer: Stripe.Customer): Promise<CustomerAudit> {
  const ageSeconds = nowSeconds - customer.created;
  const subscriptions = await listAll(
    stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 }),
    starting_after => stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100, starting_after }),
    100
  );
  const invoices = await listAll(
    stripe.invoices.list({ customer: customer.id, limit: 100 }),
    starting_after => stripe.invoices.list({ customer: customer.id, limit: 100, starting_after }),
    100
  );
  const charges = await listAll(
    stripe.charges.list({ customer: customer.id, limit: 100 }),
    starting_after => stripe.charges.list({ customer: customer.id, limit: 100, starting_after }),
    100
  );

  const liveSubscriptionCount = subscriptions.filter(sub => liveStatuses.has(sub.status)).length;
  const paidInvoices = invoices.filter(invoice =>
    ((invoice as any).paid || invoice.status === 'paid') && Number(invoice.amount_paid || 0) > 0
  ).length;
  const positiveCharges = charges.filter(charge =>
    charge.paid && !charge.refunded && Number(charge.amount || 0) > 0
  ).length;

  const reasons: string[] = [];
  if (ageSeconds < minAgeSeconds) reasons.push(`criado há menos de ${maxAgeHours}h`);
  if (liveSubscriptionCount) reasons.push(`${liveSubscriptionCount} assinatura(s) viva(s)`);
  if (paidInvoices) reasons.push(`${paidInvoices} fatura(s) paga(s) com valor positivo`);
  if (positiveCharges) reasons.push(`${positiveCharges} cobrança(s) positiva(s)`);

  const ghost = reasons.length === 0;
  return {
    id: customer.id,
    email: customer.email || '-',
    created: new Date(customer.created * 1000).toISOString(),
    ghost,
    reason: ghost ? 'sem assinatura viva, sem fatura paga positiva e sem cobrança positiva' : reasons.join('; '),
    subscriptions: subscriptions.length,
    paidInvoices,
    positiveCharges
  };
}

const customers = await listAll(
  stripe.customers.list({ limit: Math.min(100, maxCustomers) }),
  starting_after => stripe.customers.list({ limit: 100, starting_after }),
  maxCustomers
);

const audits: CustomerAudit[] = [];
for (const customer of customers) {
  audits.push(await auditCustomer(customer));
}

const ghosts = audits.filter(item => item.ghost);

if (shouldDelete) {
  for (const item of ghosts) {
    const deleted = await stripe.customers.del(item.id);
    item.deleted = !!deleted.deleted;
  }
}

console.log(`Stripe ${liveMode ? 'LIVE' : 'TEST'}: ${audits.length} cliente(s) auditado(s), ${ghosts.length} fantasma(s).`);
console.log(shouldDelete ? 'Modo: APAGOU clientes fantasma encontrados.' : 'Modo: dry-run, nada foi apagado.');
console.table(audits.map(item => ({
  id: item.id,
  email: item.email,
  criado: item.created,
  fantasma: item.ghost ? 'sim' : 'nao',
  motivo: item.reason,
  apagado: item.deleted ? 'sim' : ''
})));
