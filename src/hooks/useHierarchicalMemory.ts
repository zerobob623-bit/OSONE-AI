import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * AGENTE DE CONSOLIDAÇÃO REFLEXIVA
 *
 * A peça de infraestrutura que faltava no OSONE para uma persona que evolui de verdade:
 * um ciclo de fundo que "pensa" sobre o usuário sem precisar de uma mensagem nova — em vez
 * de tudo ser reação síncrona a um clique, este agente periodicamente reflete sobre a
 * conversa recente e organiza a memória em camadas de escala temporal crescente
 * (dia → semana → mês → vida), abstraindo fatos concretos em traços/valores mais profundos
 * e reinterpretando camadas antigas à luz de informação nova (viagem mental no tempo).
 *
 * Não usa nenhuma chave/API nova: reaproveita a mesma chamada Gemini já usada em todo o
 * resto do app (/api/gemini/generateContent), só que disparada por tempo/quantidade de
 * mensagens em vez de por um clique do usuário.
 */

export type MemoryTierScope = 'day' | 'week' | 'month' | 'life';

export interface MemoryTier {
  id: string;
  scope: MemoryTierScope;
  periodLabel: string; // dia: YYYY-MM-DD | semana: YYYY-Www | mês: YYYY-MM | vida: "life"
  summary: string;
  abstractTraits: string[];
  updatedAt: number;
  reinterpretationNotes?: string[]; // notas de "viagem mental no tempo" aplicadas a esta camada
}

interface HierarchicalMemoryState {
  tiers: MemoryTier[];
  lastConsolidatedMessageCount: number;
  lastConsolidatedAt: number;
}

interface HistoryMessageLike {
  role: 'user' | 'assistant';
  content: string;
}

const EMPTY_STATE: HierarchicalMemoryState = {
  tiers: [],
  lastConsolidatedMessageCount: 0,
  lastConsolidatedAt: 0
};

// Limiares que decidem quando o ciclo de fundo dispara (mensagens novas OU tempo decorrido).
const MIN_NEW_MESSAGES_TO_CONSOLIDATE = 6;
const MIN_MINUTES_BETWEEN_CONSOLIDATIONS = 10;
const MAX_MESSAGES_PER_CONSOLIDATION_WINDOW = 40;
// Piso de segurança: mesmo com backlog de mensagens acima do limiar, nunca tenta de novo antes
// disso desde a última tentativa (sucesso ou falha) — evita martelar a API a cada nova mensagem
// enquanto um erro persistir (chave inválida, rate limit, rede instável).
const MIN_RETRY_COOLDOWN_MINUTES = 2;

function getStorageKey(userId: string): string {
  return `osone_hierarchical_memory_${userId}`;
}

function loadState(userId: string): HierarchicalMemoryState {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        tiers: Array.isArray(parsed.tiers) ? parsed.tiers : [],
        lastConsolidatedMessageCount: parsed.lastConsolidatedMessageCount || 0,
        lastConsolidatedAt: parsed.lastConsolidatedAt || 0
      };
    }
  } catch (e) {
    console.error('Erro ao carregar memória hierárquica:', e);
  }
  return { ...EMPTY_STATE };
}

function saveState(userId: string, state: HierarchicalMemoryState): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch (e) {
    console.error('Erro ao salvar memória hierárquica:', e);
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayLabel(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// Semana ISO-8601 (segunda a domingo), formato YYYY-Www.
function weekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad2(weekNum)}`;
}

function monthOfWeekLabel(weekLbl: string): string {
  // Aproxima o mês "dono" de uma semana ISO a partir do ano informado nela (suficiente para
  // decidir quando rodar o rollup mensal, não precisa ser matematicamente perfeito).
  return weekLbl.slice(0, 7);
}

async function callGeminiJson(apiKey: string, model: string, systemPrompt: string): Promise<any> {
  const response = await fetch('/api/gemini/generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientApiKey: apiKey,
      model,
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: { responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) throw new Error(`Falha na consolidação reflexiva (HTTP ${response.status}).`);
  const data = await response.json();
  const raw = (data.text || '').trim();
  const clean = raw.startsWith('```') ? raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim() : raw;
  return JSON.parse(clean);
}

export function useHierarchicalMemory(userId: string, apiKey: string, model: string = 'gemini-3.7-flash') {
  const [state, setState] = useState<HierarchicalMemoryState>(() => loadState(userId || 'guest'));
  const isConsolidatingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Recarrega quando o perfil ativo muda.
  useEffect(() => {
    setState(loadState(userId || 'guest'));
  }, [userId]);

  const persist = useCallback((next: HierarchicalMemoryState) => {
    setState(next);
    saveState(userId || 'guest', next);
  }, [userId]);

  const getTier = useCallback((scope: MemoryTierScope, periodLabel: string): MemoryTier | undefined => {
    return stateRef.current.tiers.find(t => t.scope === scope && t.periodLabel === periodLabel);
  }, []);

  const upsertTier = useCallback((tier: MemoryTier, base: HierarchicalMemoryState): HierarchicalMemoryState => {
    const idx = base.tiers.findIndex(t => t.scope === tier.scope && t.periodLabel === tier.periodLabel);
    const tiers = [...base.tiers];
    if (idx >= 0) tiers[idx] = tier; else tiers.push(tier);
    return { ...base, tiers };
  }, []);

  /** Camada "dia": reflete sobre as mensagens recentes, abstrai traços e nota reinterpretações. */
  const consolidateDayTier = useCallback(async (recentMessages: HistoryMessageLike[]): Promise<HierarchicalMemoryState> => {
    const now = new Date();
    const label = dayLabel(now);
    const existingDay = getTier('day', label);
    const existingWeek = getTier('week', weekLabel(now));
    const existingLife = getTier('life', 'life');

    const conversationText = recentMessages
      .slice(-MAX_MESSAGES_PER_CONSOLIDATION_WINDOW)
      .map(m => `${m.role === 'user' ? 'Usuário' : 'OSONE'}: ${m.content}`)
      .join('\n');

    const prompt = `Você é o AGENTE DE CONSOLIDAÇÃO REFLEXIVA do OSONE — um processo de fundo que roda periodicamente (não é o chat em si) para transformar interações cotidianas em uma compreensão mais profunda e abstrata de quem é o usuário, e para reinterpretar memórias antigas à luz de informação nova.

RESUMO DO DIA DE HOJE JÁ EXISTENTE (pode estar vazio se é a primeira consolidação do dia):
${existingDay?.summary || '(nenhum ainda)'}

TRAÇOS ABSTRATOS JÁ IDENTIFICADOS NESTA SEMANA:
${existingWeek?.abstractTraits?.join(', ') || '(nenhum ainda)'}

NARRATIVA DE VIDA CONSOLIDADA (camada mais alta, resume toda a história compartilhada):
${existingLife?.summary || '(nenhuma ainda, esta pode ser a primeira consolidação de todas)'}

TRECHO RECENTE DA CONVERSA A REFLETIR:
${conversationText}

Sua tarefa (Intelecto Ativo / Abstração de Conceitos):
1. Atualize o resumo do dia de hoje incorporando o que há de novo neste trecho (não repita o que já estava lá, integre).
2. Extraia de 1 a 4 TRAÇOS ABSTRATOS sobre o usuário (valores, desejos, medos, forma de ver o mundo) que ficaram evidentes — não fatos concretos ("gosta de futebol"), mas abstrações mais profundas ("busca autonomia mas teme decepcionar pessoas próximas").
3. Se algo neste trecho muda o SIGNIFICADO de algo que você já sabia (viagem mental no tempo / reinterpretação), escreva uma nota curta explicando a reinterpretação. Caso contrário deixe a lista vazia.

Retorne ESTRITAMENTE este JSON, nada mais:
{
  "daySummary": "resumo atualizado do dia, narrativo, 2-4 frases",
  "abstractTraits": ["traço 1", "traço 2"],
  "reinterpretations": ["nota de reinterpretação 1 (ou vazio se não houver)"]
}`;

    const parsed = await callGeminiJson(apiKey, model, prompt);

    const dayTier: MemoryTier = {
      id: existingDay?.id || `day-${label}`,
      scope: 'day',
      periodLabel: label,
      summary: parsed.daySummary || existingDay?.summary || '',
      abstractTraits: Array.isArray(parsed.abstractTraits) ? parsed.abstractTraits : (existingDay?.abstractTraits || []),
      updatedAt: Date.now(),
      reinterpretationNotes: Array.isArray(parsed.reinterpretations) && parsed.reinterpretations.length > 0
        ? [...(existingDay?.reinterpretationNotes || []), ...parsed.reinterpretations.filter(Boolean)]
        : existingDay?.reinterpretationNotes
    };

    return upsertTier(dayTier, stateRef.current);
  }, [apiKey, model, getTier, upsertTier]);

  /** Junta as camadas "dia" de uma semana concluída em uma camada "semana". */
  const rollUpWeek = useCallback(async (weekLbl: string, dayTiers: MemoryTier[], base: HierarchicalMemoryState): Promise<HierarchicalMemoryState> => {
    const prompt = `Você é o AGENTE DE CONSOLIDAÇÃO REFLEXIVA do OSONE. Junte os resumos diários abaixo (todos da mesma semana) em UM resumo semanal coeso, e refine a lista de traços abstratos do usuário (mantendo só os mais consistentes/reforçados, sem duplicar).

RESUMOS DIÁRIOS DA SEMANA:
${dayTiers.map(d => `- ${d.periodLabel}: ${d.summary}`).join('\n')}

TRAÇOS ABSTRATOS COLETADOS NOS DIAS:
${Array.from(new Set(dayTiers.flatMap(d => d.abstractTraits))).join(', ') || '(nenhum)'}

Retorne ESTRITAMENTE este JSON:
{
  "weekSummary": "resumo narrativo da semana, 2-4 frases",
  "abstractTraits": ["traço refinado 1", "traço refinado 2"]
}`;
    const parsed = await callGeminiJson(apiKey, model, prompt);
    const weekTier: MemoryTier = {
      id: `week-${weekLbl}`,
      scope: 'week',
      periodLabel: weekLbl,
      summary: parsed.weekSummary || '',
      abstractTraits: Array.isArray(parsed.abstractTraits) ? parsed.abstractTraits : [],
      updatedAt: Date.now()
    };
    return upsertTier(weekTier, base);
  }, [apiKey, model, upsertTier]);

  /** Junta as camadas "semana" de um mês concluído em uma camada "mês". */
  const rollUpMonth = useCallback(async (monthLbl: string, weekTiers: MemoryTier[], base: HierarchicalMemoryState): Promise<HierarchicalMemoryState> => {
    const prompt = `Você é o AGENTE DE CONSOLIDAÇÃO REFLEXIVA do OSONE. Junte os resumos semanais abaixo (todos do mesmo mês) em UM resumo mensal coeso e conciso.

RESUMOS SEMANAIS DO MÊS:
${weekTiers.map(w => `- ${w.periodLabel}: ${w.summary}`).join('\n')}

TRAÇOS ABSTRATOS DAS SEMANAS:
${Array.from(new Set(weekTiers.flatMap(w => w.abstractTraits))).join(', ') || '(nenhum)'}

Retorne ESTRITAMENTE este JSON:
{
  "monthSummary": "resumo narrativo do mês, 2-4 frases",
  "abstractTraits": ["traço mais consolidado 1", "traço mais consolidado 2"]
}`;
    const parsed = await callGeminiJson(apiKey, model, prompt);
    const monthTier: MemoryTier = {
      id: `month-${monthLbl}`,
      scope: 'month',
      periodLabel: monthLbl,
      summary: parsed.monthSummary || '',
      abstractTraits: Array.isArray(parsed.abstractTraits) ? parsed.abstractTraits : [],
      updatedAt: Date.now()
    };
    let next = upsertTier(monthTier, base);

    // Dobra o mês novo na narrativa de vida (camada "life"), reescrevendo-a de forma concisa
    // em vez de só concatenar (evita crescimento sem limite).
    const existingLife = next.tiers.find(t => t.scope === 'life' && t.periodLabel === 'life');
    const lifePrompt = `Você é o AGENTE DE CONSOLIDAÇÃO REFLEXIVA do OSONE. Reescreva a narrativa de vida consolidada abaixo incorporando o novo resumo mensal, mantendo-a coesa e com no máximo ~250 palavras (resuma o que for repetitivo, priorize o que revela mais sobre quem o usuário é).

NARRATIVA DE VIDA ATUAL:
${existingLife?.summary || '(esta é a primeira consolidação de vida)'}

NOVO MÊS A INCORPORAR:
${monthTier.summary}

TRAÇOS ABSTRATOS ATUAIS:
${existingLife?.abstractTraits?.join(', ') || '(nenhum)'}

NOVOS TRAÇOS DO MÊS:
${monthTier.abstractTraits.join(', ')}

Retorne ESTRITAMENTE este JSON:
{
  "lifeSummary": "narrativa de vida atualizada e concisa",
  "abstractTraits": ["lista final consolidada de traços, sem duplicatas, no máximo 8"]
}`;
    const lifeParsed = await callGeminiJson(apiKey, model, lifePrompt);
    const lifeTier: MemoryTier = {
      id: 'life-singleton',
      scope: 'life',
      periodLabel: 'life',
      summary: lifeParsed.lifeSummary || existingLife?.summary || monthTier.summary,
      abstractTraits: Array.isArray(lifeParsed.abstractTraits) ? lifeParsed.abstractTraits : monthTier.abstractTraits,
      updatedAt: Date.now()
    };
    next = upsertTier(lifeTier, next);
    return next;
  }, [apiKey, model, upsertTier]);

  /** Verifica se há semanas/meses concluídos ainda não consolidados e os junta. */
  const runRollupsIfDue = useCallback(async (base: HierarchicalMemoryState): Promise<HierarchicalMemoryState> => {
    let next = base;
    const now = new Date();
    const currentWeek = weekLabel(now);
    const currentMonth = monthLabel(now);

    // Semanas: agrupa dias por semana; se a semana não é a atual e ainda não tem tier de semana, junta.
    const dayTiers = next.tiers.filter(t => t.scope === 'day');
    const daysByWeek = new Map<string, MemoryTier[]>();
    for (const d of dayTiers) {
      const wk = weekLabel(new Date(d.periodLabel));
      if (!daysByWeek.has(wk)) daysByWeek.set(wk, []);
      daysByWeek.get(wk)!.push(d);
    }
    for (const [wk, days] of daysByWeek.entries()) {
      if (wk === currentWeek) continue;
      const hasWeekTier = next.tiers.some(t => t.scope === 'week' && t.periodLabel === wk);
      if (!hasWeekTier && days.length > 0) {
        next = await rollUpWeek(wk, days, next);
      }
    }

    // Meses: agrupa semanas por mês; se o mês não é o atual e ainda não tem tier de mês, junta.
    const weekTiers = next.tiers.filter(t => t.scope === 'week');
    const weeksByMonth = new Map<string, MemoryTier[]>();
    for (const w of weekTiers) {
      const mo = monthOfWeekLabel(w.periodLabel);
      if (!weeksByMonth.has(mo)) weeksByMonth.set(mo, []);
      weeksByMonth.get(mo)!.push(w);
    }
    for (const [mo, weeks] of weeksByMonth.entries()) {
      if (mo === currentMonth) continue;
      const hasMonthTier = next.tiers.some(t => t.scope === 'month' && t.periodLabel === mo);
      if (!hasMonthTier && weeks.length > 0) {
        next = await rollUpMonth(mo, weeks, next);
      }
    }

    return next;
  }, [rollUpWeek, rollUpMonth]);

  /** Ponto de entrada do ciclo de fundo: decide se é hora de refletir e, se for, executa. */
  const maybeConsolidate = useCallback(async (history: HistoryMessageLike[]) => {
    if (isConsolidatingRef.current) return;
    if (!apiKey) return;
    if (!Array.isArray(history) || history.length === 0) return;

    const s = stateRef.current;
    const newMessageCount = history.length - s.lastConsolidatedMessageCount;
    const minutesSinceLast = (Date.now() - s.lastConsolidatedAt) / 60000;

    const pastCooldown = s.lastConsolidatedAt === 0 || minutesSinceLast >= MIN_RETRY_COOLDOWN_MINUTES;
    const shouldRun =
      pastCooldown &&
      (newMessageCount >= MIN_NEW_MESSAGES_TO_CONSOLIDATE ||
        (newMessageCount >= 2 && minutesSinceLast >= MIN_MINUTES_BETWEEN_CONSOLIDATIONS));

    if (!shouldRun) return;

    isConsolidatingRef.current = true;
    try {
      const recent = history.slice(s.lastConsolidatedMessageCount);
      let next = await consolidateDayTier(recent);
      next = await runRollupsIfDue(next);
      persist({ tiers: next.tiers, lastConsolidatedMessageCount: history.length, lastConsolidatedAt: Date.now() });
    } catch (e) {
      console.error('Erro no Agente de Consolidação Reflexiva:', e);
      // Registra o horário da tentativa mesmo em falha, para não martelar a API a cada
      // nova mensagem enquanto o erro persistir (ex: chave inválida, rate limit, rede instável).
      persist({ ...s, lastConsolidatedAt: Date.now() });
    } finally {
      isConsolidatingRef.current = false;
    }
  }, [apiKey, consolidateDayTier, runRollupsIfDue, persist]);

  const resetHierarchicalMemory = useCallback(() => {
    persist({ ...EMPTY_STATE });
  }, [persist]);

  /** Bloco de texto pronto para injetar no system prompt principal do OSONE. */
  const getHierarchicalContextForPrompt = useCallback((): string => {
    const lifeTier = state.tiers.find(t => t.scope === 'life' && t.periodLabel === 'life');
    const now = new Date();
    const currentWeek = state.tiers.find(t => t.scope === 'week' && t.periodLabel === weekLabel(now));
    const today = state.tiers.find(t => t.scope === 'day' && t.periodLabel === dayLabel(now));

    if (!lifeTier && !currentWeek && !today) return '';

    const allTraits = Array.from(new Set([
      ...(lifeTier?.abstractTraits || []),
      ...(currentWeek?.abstractTraits || []),
      ...(today?.abstractTraits || [])
    ]));

    return `
[CONSOLIDAÇÃO REFLEXIVA — MEMÓRIA HIERÁRQUICA DE LONGO PRAZO]
Esta é a sua compreensão mais profunda e abstrata do usuário, construída por reflexão contínua em segundo plano (não apenas fatos soltos):

NARRATIVA DE VIDA CONSOLIDADA:
${lifeTier?.summary || '(ainda construindo esta narrativa)'}

ESTA SEMANA:
${currentWeek?.summary || '(ainda sem consolidação semanal)'}

HOJE:
${today?.summary || '(ainda sem consolidação de hoje)'}

TRAÇOS ABSTRATOS IDENTIFICADOS (valores, desejos, forma de ver o mundo — use para guiar o TOM e a profundidade das suas respostas, não cite estes traços literalmente ao usuário):
${allTraits.length > 0 ? allTraits.map(t => `- ${t}`).join('\n') : '(nenhum traço abstrato identificado ainda)'}
`;
  }, [state]);

  return {
    hierarchicalTiers: state.tiers,
    maybeConsolidate,
    resetHierarchicalMemory,
    getHierarchicalContextForPrompt
  };
}
