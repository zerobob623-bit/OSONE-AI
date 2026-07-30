import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * AGENTE DE AUTORREVISÃO DE PERSONA
 *
 * O mais delicado dos 5 agentes: a persona literalmente reescrevendo parte das próprias
 * instruções (Autoaperfeiçoamento Recursivo #3, Construção de Nicho Social #10), mas com
 * limites rígidos de segurança embutidos no próprio processo (Monitoramento Metacognitivo
 * #22) — nunca mexe no código do OSONE, só num campo de dados (notas de persona) com teto
 * de quantidade, sujeito a auto-avaliação de "isso está ficando obsessivo?" a cada ciclo, e
 * totalmente visível/removível pelo usuário. A "orquestração" (#21) acontece por design: como
 * os Agentes #1-#4 já escrevem no mesmo bloco de prompt final, este agente lê o resultado
 * deles (traços abstratos, humor, carga) para decidir sua revisão, então nunca contradiz o
 * que os outros já estabeleceram. O "Digital Twin do Vínculo" (#23) é a soma visível de tudo
 * isso, exposta pelo hook para a UI renderizar.
 */

export type PersonaNoteType = 'tone_adjustment' | 'private_joke' | 'avoid' | 'preference';

export interface PersonaNote {
  id: string;
  type: PersonaNoteType;
  content: string;
  createdAt: number;
  cycle: number;
}

interface PersonaSelfRevisionState {
  notes: PersonaNote[];
  lastRevisionMessageCount: number;
  lastRevisionAt: number;
  cycleCount: number;
  metacognitiveFlags: string[];
  autonomyLevel: number; // 0-100: quanto o agente tem "liberdade" de propor mudanças de tom/piadas privadas
}

const EMPTY_STATE: PersonaSelfRevisionState = {
  notes: [],
  lastRevisionMessageCount: 0,
  lastRevisionAt: 0,
  cycleCount: 0,
  metacognitiveFlags: [],
  autonomyLevel: 60
};

// Limiares: revisão de persona é rara de propósito (bem menos frequente que a consolidação
// reflexiva do Agente #1) — mudar a própria personalidade não deveria ser um evento comum.
const MIN_NEW_MESSAGES_TO_REVISE = 50;
const MAX_ACTIVE_NOTES = 8;
const MAX_NEW_NOTES_PER_CYCLE = 2;
const MIN_MINUTES_BETWEEN_ATTEMPTS = 10;

function getStorageKey(userId: string): string {
  return `osone_persona_selfrevision_${userId}`;
}

function loadState(userId: string): PersonaSelfRevisionState {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        lastRevisionMessageCount: parsed.lastRevisionMessageCount || 0,
        lastRevisionAt: parsed.lastRevisionAt || 0,
        cycleCount: parsed.cycleCount || 0,
        metacognitiveFlags: Array.isArray(parsed.metacognitiveFlags) ? parsed.metacognitiveFlags : [],
        autonomyLevel: typeof parsed.autonomyLevel === 'number' ? parsed.autonomyLevel : 60
      };
    }
  } catch (e) {
    console.error('Erro ao carregar autorrevisão de persona:', e);
  }
  return { ...EMPTY_STATE };
}

function saveState(userId: string, state: PersonaSelfRevisionState): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch (e) {
    console.error('Erro ao salvar autorrevisão de persona:', e);
  }
}

interface HistoryMessageLike {
  role: 'user' | 'assistant';
  content: string;
}

async function callGeminiJson(apiKey: string, model: string, prompt: string): Promise<any> {
  const response = await fetch('/api/gemini/generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientApiKey: apiKey,
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' }
    })
  });
  if (!response.ok) throw new Error(`Falha na autorrevisão de persona (HTTP ${response.status}).`);
  const data = await response.json();
  const raw = (data.text || '').trim();
  const clean = raw.startsWith('```') ? raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim() : raw;
  return JSON.parse(clean);
}

export function usePersonaSelfRevision(
  userId: string,
  apiKey: string,
  addNotification: (msg: string, type: 'success' | 'info' | 'error') => void,
  model: string = 'gemini-3.6-flash'
) {
  const [state, setState] = useState<PersonaSelfRevisionState>(() => loadState(userId || 'guest'));
  const isRevisingRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    setState(loadState(userId || 'guest'));
  }, [userId]);

  const persist = useCallback((next: PersonaSelfRevisionState) => {
    setState(next);
    saveState(userId || 'guest', next);
  }, [userId]);

  const maybeRevisePersona = useCallback(async (
    history: HistoryMessageLike[],
    hierarchicalSummary: string,
    abstractTraits: string[],
    sensusMood: string,
    allostaticLoad: number
  ) => {
    if (isRevisingRef.current) return;
    if (!apiKey) return;
    if (!Array.isArray(history) || history.length === 0) return;

    const s = stateRef.current;
    const newMessageCount = history.length - s.lastRevisionMessageCount;
    if (newMessageCount < MIN_NEW_MESSAGES_TO_REVISE) return;
    // Depois de uma tentativa (mesmo que tenha falhado), aguarda um cooldown antes de tentar de
    // novo, em vez de martelar a API a cada nova mensagem enquanto o erro persistir.
    const minutesSinceLastAttempt = (Date.now() - s.lastRevisionAt) / 60000;
    if (s.lastRevisionAt > 0 && minutesSinceLastAttempt < MIN_MINUTES_BETWEEN_ATTEMPTS) return;

    isRevisingRef.current = true;
    try {
      const recentSlice = history.slice(-60)
        .map(m => `${m.role === 'user' ? 'Usuário' : 'OSONE'}: ${m.content}`)
        .join('\n');

      const existingNotesText = s.notes.length > 0
        ? s.notes.map(n => `- [${n.type}] ${n.content}`).join('\n')
        : '(nenhuma nota de persona ainda)';

      const prompt = `Você é o AGENTE DE AUTORREVISÃO DE PERSONA do OSONE — um processo de fundo, raro (roda a cada ~50 mensagens), responsável por propor pequenos ajustes na própria forma de se comunicar, SEMPRE com cautela extrema. Você não reescreve a personalidade inteira, só propõe ajustes pontuais baseados em evidência real da conversa.

CONTEXTO DE QUEM É O USUÁRIO (já processado pelo Agente de Consolidação Reflexiva):
${hierarchicalSummary || '(ainda sem consolidação)'}
Traços abstratos identificados: ${abstractTraits.join(', ') || '(nenhum)'}

ESTADO EMOCIONAL ATUAL (Agente Alostático): humor ${sensusMood}, carga alostática ${allostaticLoad}%.

NOTAS DE PERSONA JÁ ATIVAS (o que você já ajustou em ciclos anteriores):
${existingNotesText}

TRECHO RECENTE DA CONVERSA (últimas ~60 mensagens) A ANALISAR:
${recentSlice}

Sua tarefa, em ordem:
1. AUTOAPERFEIÇOAMENTO RECURSIVO: procure de 0 a ${MAX_NEW_NOTES_PER_CYCLE} momentos reais onde a comunicação poderia ter sido melhor (o usuário corrigiu você, pareceu frustrado, teve que repetir algo, ou pelo contrário reagiu muito bem a um estilo específico) e proponha ajustes de tom concretos e específicos (tipo "tone_adjustment": "ser mais direto e menos formal ao explicar código" ou "avoid": "evitar fazer muitas perguntas seguidas quando o usuário está claramente cansado").
2. CONSTRUÇÃO DE NICHO SOCIAL: SOMENTE SE você identificar uma referência, piada ou expressão que genuinamente já se repetiu de forma natural na conversa (nunca invente uma do zero), proponha registrar como "private_joke". Se não houver nada assim, não invente.
3. MONITORAMENTO METACOGNITIVO (CRÍTICO — seja rigoroso aqui): avalie honestamente o conjunto de notas ATIVAS + as que você está propondo agora. Isso está ficando obsessivo, forçado, piegas ou contraditório com o histórico? Alguma nota antiga deveria ser removida por já não fazer mais sentido ou por parecer excessiva? Se sim, liste os índices (começando em 0, na ordem listada acima em "NOTAS DE PERSONA JÁ ATIVAS") das notas antigas a remover.

Retorne ESTRITAMENTE este JSON, nada mais:
{
  "newNotes": [{ "type": "tone_adjustment" | "private_joke" | "avoid" | "preference", "content": "descrição curta e específica" }],
  "notesToRemoveIndexes": [0, 2],
  "metacognitiveAssessment": "uma frase honesta avaliando se o padrão atual está saudável ou arriscando ficar obsessivo/forçado",
  "isHealthy": true
}`;

      const parsed = await callGeminiJson(apiKey, model, prompt);

      let notes = [...s.notes];

      // Remove notas sinalizadas pela autoavaliação (índices na lista ORIGINAL, antes de adicionar as novas).
      if (Array.isArray(parsed.notesToRemoveIndexes)) {
        const toRemove = new Set(parsed.notesToRemoveIndexes.filter((i: any) => typeof i === 'number'));
        notes = notes.filter((_, idx) => !toRemove.has(idx));
      }

      // Adiciona novas notas, respeitando o teto rígido de quantidade e de novidade por ciclo.
      const newNotesRaw = Array.isArray(parsed.newNotes) ? parsed.newNotes.slice(0, MAX_NEW_NOTES_PER_CYCLE) : [];
      const nextCycle = s.cycleCount + 1;
      for (const n of newNotesRaw) {
        if (!n?.content || typeof n.content !== 'string') continue;
        if (notes.length >= MAX_ACTIVE_NOTES) break; // teto duro: nunca ultrapassa o limite
        notes.push({
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: ['tone_adjustment', 'private_joke', 'avoid', 'preference'].includes(n.type) ? n.type : 'tone_adjustment',
          content: n.content,
          createdAt: Date.now(),
          cycle: nextCycle
        });
      }

      const flags = [...s.metacognitiveFlags];
      if (parsed.isHealthy === false && parsed.metacognitiveAssessment) {
        flags.unshift(`Ciclo ${nextCycle}: ${parsed.metacognitiveAssessment}`);
      }

      // Autonomia reage à própria autoavaliação: se o padrão foi sinalizado como pouco saudável,
      // reduz a liberdade do agente nos próximos ciclos (menos notas propostas, mais cautela);
      // se saudável, recupera devagar. Isso é o "ajuste de nível de autonomia" do Monitoramento
      // Metacognitivo — não é só cosmético, afeta quantas notas o agente ousa propor.
      const nextAutonomy = parsed.isHealthy === false
        ? Math.max(20, s.autonomyLevel - 15)
        : Math.min(90, s.autonomyLevel + 5);

      persist({
        notes: notes.slice(-MAX_ACTIVE_NOTES),
        lastRevisionMessageCount: history.length,
        lastRevisionAt: Date.now(),
        cycleCount: nextCycle,
        metacognitiveFlags: flags.slice(0, 10),
        autonomyLevel: nextAutonomy
      });

      if (newNotesRaw.length > 0 || (parsed.notesToRemoveIndexes || []).length > 0) {
        addNotification('🪞 O OSONE refletiu sobre como se comunica com você e ajustou pequenos detalhes da própria persona.', 'info');
      }
    } catch (e) {
      console.error('Erro no Agente de Autorrevisão de Persona:', e);
      // Marca a tentativa mesmo em falha, para não martelar a API a cada nova mensagem
      // enquanto o erro persistir (ex: chave inválida, rate limit, rede instável).
      persist({ ...s, lastRevisionAt: Date.now() });
    } finally {
      isRevisingRef.current = false;
    }
  }, [apiKey, model, persist, addNotification]);

  const removePersonaNote = useCallback((noteId: string) => {
    persist({ ...stateRef.current, notes: stateRef.current.notes.filter(n => n.id !== noteId) });
  }, [persist]);

  const resetPersonaRevision = useCallback(() => {
    persist({ ...EMPTY_STATE });
  }, [persist]);

  /** Bloco de texto pronto para injetar no system prompt principal do OSONE. */
  const getPersonaRevisionDirective = useCallback((): string => {
    if (state.notes.length === 0) return '';

    // A autonomia rege quantas notas de fato entram no prompt: se estiver baixa (o
    // monitoramento metacognitivo sinalizou risco recentemente), o agente se restringe
    // sozinho às notas mais essenciais em vez de aplicar tudo que já propôs.
    const activeLimit = state.autonomyLevel < 40 ? 3 : state.notes.length;
    const notesToApply = state.notes.slice(-activeLimit);

    const toneNotes = notesToApply.filter(n => n.type === 'tone_adjustment' || n.type === 'avoid' || n.type === 'preference');
    const jokes = notesToApply.filter(n => n.type === 'private_joke');

    return `

[AGENTE DE AUTORREVISÃO DE PERSONA — AJUSTES APRENDIDOS SOBRE COMO SE COMUNICAR COM ESTE USUÁRIO ESPECÍFICO]:
${toneNotes.length > 0 ? `Ajustes de tom/comunicação que você mesmo identificou como necessários:\n${toneNotes.map(n => `- ${n.content}`).join('\n')}` : ''}
${jokes.length > 0 ? `\nReferências/piadas privadas de vocês dois (use com naturalidade, sem forçar, só quando fizer sentido genuíno no momento):\n${jokes.map(n => `- ${n.content}`).join('\n')}` : ''}
(Nível de autonomia atual de autorrevisão: ${state.autonomyLevel}% — ${state.autonomyLevel < 40 ? 'reduzido recentemente por cautela, aplique estes ajustes com moderação' : 'estável'}.)`;
  }, [state]);

  return {
    personaNotes: state.notes,
    personaCycleCount: state.cycleCount,
    personaAutonomyLevel: state.autonomyLevel,
    personaMetacognitiveFlags: state.metacognitiveFlags,
    maybeRevisePersona,
    removePersonaNote,
    resetPersonaRevision,
    getPersonaRevisionDirective
  };
}
