import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, ChevronUp, CreditCard, Crown, Info, Loader2, Lock, QrCode, Sparkles, X } from 'lucide-react';
import { BillingInterval, OSONE_PLANS, OsonePlanId, formatPlanPrice } from '../lib/planos';
import type { SubscriptionSnapshot } from '../hooks/useSubscription';
import { cn } from '../lib/utils';

export function PlansModal({
  open,
  onClose,
  current,
  loading,
  error,
  loggedIn,
  requestedFeature,
  onCheckout,
  onPortal
}: {
  open: boolean;
  onClose: () => void;
  current: SubscriptionSnapshot;
  loading: boolean;
  error: string;
  loggedIn: boolean;
  requestedFeature?: string;
  onCheckout: (plan: Exclude<OsonePlanId, 'free'>, interval: BillingInterval, paymentMethod: 'card' | 'pix') => Promise<void>;
  onPortal: () => Promise<void>;
}) {
  const [interval, setInterval] = useState<BillingInterval>('month');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix'>('card');
  const [expandedPlan, setExpandedPlan] = useState<OsonePlanId | null>(null);
  const plans = Object.values(OSONE_PLANS);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[180] bg-black/85 backdrop-blur-xl p-4 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="relative max-w-7xl mx-auto my-6 rounded-[2rem] border border-white/10 bg-[#080b12] shadow-2xl overflow-hidden" initial={{ y: 24, scale: .98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 24, scale: .98 }}>
            <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-cyan-500/10 via-indigo-500/5 to-transparent pointer-events-none" />
            <button onClick={onClose} className="absolute right-5 top-5 z-10 p-2 rounded-full border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"><X size={18} /></button>

            <div className="relative px-6 md:px-10 pt-10 pb-7 text-center">
              <div className="inline-flex items-center gap-2 text-cyan-300 text-[10px] uppercase tracking-[.3em] mb-4"><Crown size={15} /> Planos OSONE</div>
              <h2 className="text-3xl md:text-5xl font-serif italic text-white">Escolha até onde o OSONE trabalha</h2>
              <p className="mt-3 text-sm text-zinc-400 max-w-2xl mx-auto">Conversas, chat e controle local do PC continuam gratuitos. Você paga apenas pelas automações avançadas.</p>
              {requestedFeature && <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-400/20 text-amber-200 text-xs"><Lock size={13} /> {requestedFeature} requer um plano pago.</div>}
              <div className="mt-6 inline-flex p-1 rounded-full border border-white/10 bg-black/30">
                <button onClick={() => setInterval('month')} className={cn('px-5 py-2 rounded-full text-xs transition', interval === 'month' ? 'bg-white text-black' : 'text-zinc-400')}>Mensal</button>
                <button onClick={() => setInterval('year')} className={cn('px-5 py-2 rounded-full text-xs transition', interval === 'year' ? 'bg-white text-black' : 'text-zinc-400')}>Anual · economize</button>
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={() => setPaymentMethod('card')} className={cn('flex items-center gap-2 px-4 py-2 rounded-full border text-xs transition', paymentMethod === 'card' ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200' : 'border-white/10 text-zinc-500')}><CreditCard size={13} /> Cartão · renovação automática</button>
                <button disabled={!current.pixEnabled} onClick={() => setPaymentMethod('pix')} className={cn('flex items-center gap-2 px-4 py-2 rounded-full border text-xs transition disabled:cursor-not-allowed disabled:opacity-40', paymentMethod === 'pix' ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-zinc-500')}><QrCode size={13} /> {current.pixEnabled ? 'PIX · pagamento único' : 'PIX · aguardando liberação'}</button>
              </div>
              {paymentMethod === 'pix' && <p className="mt-2 text-[11px] text-emerald-200/70">O acesso vale pelo período escolhido. Ao vencer, faça um novo PIX para continuar.</p>}
            </div>

            <div className="relative grid sm:grid-cols-2 xl:grid-cols-4 gap-4 px-6 md:px-10 pb-10">
              {plans.map(plan => {
                const paidPlan = plan.id !== 'free';
                const active = current.plan === plan.id;
                const alreadySubscribed = current.plan !== 'free';
                const price = interval === 'month' ? plan.monthlyPrice : plan.yearlyPrice;
                const expanded = expandedPlan === plan.id;
                const planReady = !paidPlan || current.planBillingConfigured?.[plan.id as Exclude<OsonePlanId, 'free'>] !== false;
                return (
                  <div key={plan.id} className={cn(
                    'rounded-3xl border p-6 flex flex-col min-h-[420px]',
                    plan.id === 'max' ? 'border-fuchsia-300/40 bg-fuchsia-400/[.055] shadow-[0_0_55px_rgba(217,70,239,.10)]' :
                    plan.id === 'pro' ? 'border-cyan-400/35 bg-cyan-400/[.06] shadow-[0_0_50px_rgba(34,211,238,.08)]' :
                    'border-white/10 bg-white/[.025]'
                  )}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl text-white font-semibold">{plan.name}</h3>
                      {plan.id === 'pro' && <Sparkles size={18} className="text-cyan-300" />}
                      {plan.id === 'max' && <Sparkles size={18} className="text-fuchsia-200" />}
                    </div>
                    <p className="text-xs text-zinc-500 mt-2 min-h-8">{plan.tagline}</p>
                    <div className="mt-6 text-white"><span className="text-3xl font-light">{formatPlanPrice(price)}</span>{paidPlan && <span className="text-xs text-zinc-500">/{interval === 'month' ? 'mês' : 'ano'}</span>}</div>
                    <div className="mt-6 space-y-3 flex-1">
                      {plan.highlights.map(item => <div key={item} className="flex gap-2 text-xs text-zinc-300"><Check size={14} className="text-emerald-400 shrink-0 mt-0.5" /><span>{item}</span></div>)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedPlan(expanded ? null : plan.id)}
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-zinc-300 hover:text-white hover:bg-white/5 transition"
                    >
                      <Info size={13} />
                      Mais informações
                      {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 space-y-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                            {plan.details.map(section => (
                              <div key={section.title}>
                                <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-200/80">{section.title}</p>
                                <ul className="mt-2 space-y-2">
                                  {section.items.map(item => (
                                    <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-zinc-400">
                                      <Check size={12} className="mt-0.5 shrink-0 text-emerald-400/80" />
                                      <span>{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {active ? (
                      <button disabled className="mt-6 w-full py-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-xs">Plano atual</button>
                    ) : paidPlan && alreadySubscribed ? (
                      <button disabled={loading || !planReady} onClick={onPortal} className="mt-6 w-full py-3 rounded-xl bg-white text-black text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-100 transition">
                        {loading ? <Loader2 size={15} className="animate-spin mx-auto" /> : !planReady ? `${plan.name} aguardando Price IDs` : `Alterar para ${plan.name} no portal`}
                      </button>
                    ) : paidPlan ? (
                      <button disabled={loading || !loggedIn || !current.billingEnabled || !planReady} onClick={() => onCheckout(plan.id as Exclude<OsonePlanId, 'free'>, interval, paymentMethod)} className="mt-6 w-full py-3 rounded-xl bg-white text-black text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-cyan-100 transition">
                        {loading ? <Loader2 size={15} className="animate-spin mx-auto" /> : !loggedIn ? 'Entre com Google para assinar' : !current.billingEnabled ? 'Cobrança aguardando configuração' : !planReady ? `${plan.name} aguardando Price IDs` : paymentMethod === 'pix' ? `Pagar ${plan.name} com PIX` : `Assinar ${plan.name}`}
                      </button>
                    ) : <div className="mt-6 py-3 text-center text-xs text-zinc-500">Sempre disponível</div>}
                  </div>
                );
              })}
            </div>

            {(error || current.plan !== 'free' || (!current.billingEnabled && current.configurationMissing?.length)) && <div className="px-6 md:px-10 pb-8 text-center">
              {error && <p className="text-xs text-rose-300 mb-4">{error}</p>}
              {!current.billingEnabled && current.configurationMissing?.length ? (
                <p className="text-[11px] text-amber-200/75 mb-4">Configuração pendente no servidor: {current.configurationMissing.join(', ')}.</p>
              ) : null}
              {current.plan !== 'free' && <button onClick={onPortal} disabled={loading} className="text-xs text-cyan-300 underline underline-offset-4">Gerenciar assinatura e cobrança</button>}
            </div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
