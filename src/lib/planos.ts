export type OsonePlanId = 'free' | 'plus' | 'pro';
export type BillingInterval = 'month' | 'year';
export type PaidFeature = 'cowork_browser' | 'hear' | 'osone_code' | 'whatsapp';

export interface OsonePlan {
  id: OsonePlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PaidFeature[];
  highlights: string[];
}

export const OSONE_PLANS: Record<OsonePlanId, OsonePlan> = {
  free: {
    id: 'free',
    name: 'Grátis',
    tagline: 'O núcleo do OSONE continua seu.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [],
    highlights: [
      'Chat de texto e conversa por voz',
      'Hands-Free por OSOne ou palma',
      'Agente Local para controlar o PC',
      'Aba de Escrita, inclusive para escrever código'
    ]
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'Escuta e automação avançada.',
    monthlyPrice: 39.90,
    yearlyPrice: 339.90,
    features: ['cowork_browser', 'hear'],
    highlights: [
      'Tudo do plano Grátis',
      'OSONE HEAR completo',
      'OSONE COWORK: cliques e escrita no navegador',
      'Economize no plano anual'
    ]
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'O OSONE pronto para trabalhar e atender.',
    monthlyPrice: 69.90,
    yearlyPrice: 669.90,
    features: ['cowork_browser', 'hear', 'osone_code', 'whatsapp'],
    highlights: [
      'Tudo do plano Plus',
      'OSONE CODE: Enxame, Hunter, GitHub e runtimes de código',
      'OSONE ZAP completo',
      'Automação de atendimento e base de conhecimento',
      'Economize no plano anual'
    ]
  }
};

export const PLAN_RANK: Record<OsonePlanId, number> = { free: 0, plus: 1, pro: 2 };

export const planHasFeature = (plan: OsonePlanId, feature: PaidFeature): boolean =>
  OSONE_PLANS[plan].features.includes(feature);

export const minimumPlanForFeature = (feature: PaidFeature): OsonePlanId =>
  feature === 'whatsapp' || feature === 'osone_code' ? 'pro' : 'plus';

/** Um único mapa para menu, comandos de voz e ferramentas não divergirem sobre o que é pago. */
export const paidFeatureForWorkspace = (mode: string): PaidFeature | null => {
  if (mode === 'cowork') return 'cowork_browser';
  if (mode === 'hear') return 'hear';
  if (mode === 'code') return 'osone_code';
  if (mode === 'whatsapp') return 'whatsapp';
  return null;
};

export const formatPlanPrice = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
