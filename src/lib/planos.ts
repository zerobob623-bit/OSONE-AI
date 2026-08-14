export type OsonePlanId = 'free' | 'plus' | 'pro' | 'max';
export type BillingInterval = 'month' | 'year';
export type PaidFeature = 'cowork_browser' | 'hear' | 'osone_code' | 'whatsapp' | 'agentic_research';

export interface OsonePlanDetail {
  title: string;
  items: string[];
}

export interface OsonePlan {
  id: OsonePlanId;
  name: string;
  tagline: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: PaidFeature[];
  highlights: string[];
  details: OsonePlanDetail[];
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
    ],
    details: [
      {
        title: 'O que continua livre',
        items: [
          'Conversar por texto e por voz com o OSONE.',
          'Ativar Hands-Free dizendo “OSONE” ou batendo palma.',
          'Usar o Agente Local para abrir apps, pastas e arquivos no PC.',
          'Escrever textos e códigos na aba de Escrita sem entrar no OSONE CODE.'
        ]
      },
      {
        title: 'Limites honestos',
        items: [
          'Não inclui COWORK clicando/escrevendo no navegador.',
          'Não inclui HEAR completo, ZAP, OSONE CODE nem navegação agêntica avançada.'
        ]
      }
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
    ],
    details: [
      {
        title: 'Para produtividade no navegador',
        items: [
          'COWORK pode clicar, digitar e seguir fluxos em sites com supervisão visual.',
          'Permite gravar/ensinar automações e usar passos salvos no navegador.',
          'Mantém o controle local do PC gratuito separado do COWORK pago.'
        ]
      },
      {
        title: 'Escuta e organização',
        items: [
          'HEAR completo para ouvir, transcrever e organizar fala, aulas e reuniões.',
          'Ideal para quem quer automação de tela e escuta ativa sem usar OSONE CODE.'
        ]
      }
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
    ],
    details: [
      {
        title: 'Para criar e manter software',
        items: [
          'OSONE CODE com projetos multiarquivo, preview, Hunter, Enxame e execução de runtimes.',
          'Integração GitHub com importar repo, auditar segredos, criar branch, commit, PR e merge confirmado.',
          'Opção de usar Gemini padrão ou chaves próprias de OpenAI/Claude apenas no CODE.'
        ]
      },
      {
        title: 'Atendimento e WhatsApp',
        items: [
          'OSONE ZAP completo com resposta automática, base de conhecimento e mídia de áudio.',
          'Bom para vender, atender e manter automações de código no mesmo pacote.'
        ]
      }
    ]
  },
  max: {
    id: 'max',
    name: 'Max',
    tagline: 'Pesquisa agêntica e trabalho pesado.',
    monthlyPrice: 119.90,
    yearlyPrice: 1199.90,
    features: ['cowork_browser', 'hear', 'osone_code', 'whatsapp', 'agentic_research'],
    highlights: [
      'Tudo do plano Pro',
      'Pesquisa web agêntica avançada',
      'Coleta de fontes, ida e volta entre páginas e relatório',
      'Tarefas longas com mais autonomia',
      'Economize no plano anual'
    ],
    details: [
      {
        title: 'Para valer o plano mais alto',
        items: [
          'Pesquisa avançada com navegação entre páginas, comparação de fontes e retorno com síntese.',
          'Fluxos mais longos para investigar, coletar dados e organizar resultados antes de responder.',
          'Preparado para recursos premium de agentes web sem tirar a pesquisa básica do plano gratuito.'
        ]
      },
      {
        title: 'Quando usar',
        items: [
          'Quando você quer que o OSONE procure, confira, compare e volte com uma análise mais completa.',
          'Quando COWORK + CODE + ZAP não bastam e a tarefa exige investigação autônoma.'
        ]
      }
    ]
  }
};

export const PLAN_RANK: Record<OsonePlanId, number> = { free: 0, plus: 1, pro: 2, max: 3 };

export const planHasFeature = (plan: OsonePlanId, feature: PaidFeature): boolean =>
  OSONE_PLANS[plan].features.includes(feature);

export const minimumPlanForFeature = (feature: PaidFeature): OsonePlanId => {
  if (feature === 'agentic_research') return 'max';
  if (feature === 'whatsapp' || feature === 'osone_code') return 'pro';
  return 'plus';
};

/** Um único mapa para menu, comandos de voz e ferramentas não divergirem sobre o que é pago. */
export const paidFeatureForWorkspace = (mode: string): PaidFeature | null => {
  if (mode === 'cowork') return 'cowork_browser';
  if (mode === 'hear') return 'hear';
  if (mode === 'code') return 'osone_code';
  if (mode === 'whatsapp') return 'whatsapp';
  if (mode === 'research' || mode === 'web_research') return 'agentic_research';
  return null;
};

export const formatPlanPrice = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
