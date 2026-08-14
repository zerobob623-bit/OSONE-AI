import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  ClipboardList,
  Download,
  FilePlus2,
  FileText,
  Globe2,
  History,
  Loader2,
  MessageSquareText,
  Mic,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { ApiKeys } from '../types';
import { cn } from '../lib/utils';

type FontePesquisaTipo = 'web' | 'texto' | 'arquivo';

interface FontePesquisa {
  id: string;
  titulo: string;
  url?: string;
  conteudo: string;
  resumo?: string;
  tipo: FontePesquisaTipo;
  selecionada: boolean;
  criadaEm: number;
}

interface MensagemPesquisa {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface HistoricoPesquisa {
  id: string;
  consulta: string;
  criadaEm: number;
  duracaoMs: number;
  limiteMs: number;
  fontesEncontradas: number;
  fontesAdicionadas: number;
  status: 'concluida' | 'tempo_limite' | 'erro';
  observacao?: string;
}

interface OsoneResearchWorkspaceProps {
  apiKeys: ApiKeys;
  onBack: () => void;
  onNotification?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onStartLiveVoice?: () => void;
  onContextChange?: (context: string) => void;
}

const STORAGE_KEY = 'osone_research_workspace_v1';
const MAX_SOURCE_CHARS = 9000;
const MAX_CONTEXT_CHARS = 42000;
const OPCOES_TEMPO_PESQUISA = [
  { label: '1 min', value: 60_000 },
  { label: '2 min', value: 120_000 },
  { label: '5 min', value: 300_000 }
];
const OPCOES_MAX_FONTES = [8, 15, 25, 40];

const exemploDePergunta = 'Compare as fontes, extraia os pontos principais e monte uma conclusão prática.';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function limitar(texto: string, max: number): string {
  const limpo = String(texto || '').trim();
  return limpo.length > max ? `${limpo.slice(0, max)}\n\n[...cortado para caber no contexto...]` : limpo;
}

function limparRespostaNatural(texto: string): string {
  return String(texto || '')
    .replace(/^```(?:\w+)?\s*/gm, '')
    .replace(/\s*```$/gm, '')
    .replace(/^\s*[-_*]{3,}\s*$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function consultasDeInvestigacao(consulta: string, profundidade: 'rapida' | 'profunda'): string[] {
  const base = consulta.trim();
  if (profundidade === 'rapida') return [base];
  return [
    base,
    `${base} fontes confiáveis`,
    `${base} análise completa`,
    `${base} dados recentes`,
    `${base} estudo relatório`,
    `${base} críticas limitações`
  ];
}

function fonteAssinatura(fonte: FontePesquisa): string {
  return (fonte.url || fonte.titulo).toLowerCase().replace(/\s+/g, ' ').trim();
}

async function fetchJsonComTempo<T>(url: string, body: Record<string, any>, prazoMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(800, prazoMs));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function tempoRestanteAte(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function escaparHtml(texto: string): string {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function normalizarFonteWeb(item: any): FontePesquisa | null {
  const url = item?.url || item?.link || item?.web?.uri || '';
  const titulo = item?.title || item?.titulo || item?.web?.title || url || 'Fonte web';
  const conteudo = item?.content || item?.snippet || item?.resumo || item?.text || '';
  if (!titulo && !conteudo) return null;
  return {
    id: uid('fonte-web'),
    titulo: String(titulo).slice(0, 180),
    url: url ? String(url) : undefined,
    conteudo: limitar(String(conteudo || titulo || url), MAX_SOURCE_CHARS),
    resumo: String(conteudo || '').slice(0, 300),
    tipo: 'web',
    selecionada: true,
    criadaEm: Date.now()
  };
}

export const OsoneResearchWorkspace: React.FC<OsoneResearchWorkspaceProps> = ({
  apiKeys,
  onBack,
  onNotification,
  onStartLiveVoice,
  onContextChange
}) => {
  const [consulta, setConsulta] = useState('');
  const [fontes, setFontes] = useState<FontePesquisa[]>([]);
  const [mensagens, setMensagens] = useState<MensagemPesquisa[]>([]);
  const [pergunta, setPergunta] = useState('');
  const [notaTitulo, setNotaTitulo] = useState('');
  const [notaConteudo, setNotaConteudo] = useState('');
  const [studioOutput, setStudioOutput] = useState('');
  const [carregandoPesquisa, setCarregandoPesquisa] = useState(false);
  const [progressoPesquisa, setProgressoPesquisa] = useState('');
  const [limiteTempoMs, setLimiteTempoMs] = useState(120_000);
  const [maxFontesPesquisa, setMaxFontesPesquisa] = useState(15);
  const [profundidadePesquisa, setProfundidadePesquisa] = useState<'rapida' | 'profunda'>('profunda');
  const [historicoPesquisas, setHistoricoPesquisas] = useState<HistoricoPesquisa[]>([]);
  const [respondendo, setRespondendo] = useState(false);
  const [abaStudio, setAbaStudio] = useState<'relatorio' | 'tabela' | 'grafico' | 'cartoes'>('relatorio');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed?.fontes)) setFontes(parsed.fontes);
      if (Array.isArray(parsed?.mensagens)) setMensagens(parsed.mensagens);
      if (Array.isArray(parsed?.historicoPesquisas)) setHistoricoPesquisas(parsed.historicoPesquisas);
      if (typeof parsed?.limiteTempoMs === 'number') setLimiteTempoMs(parsed.limiteTempoMs);
      if (typeof parsed?.maxFontesPesquisa === 'number') setMaxFontesPesquisa(parsed.maxFontesPesquisa);
      if (parsed?.profundidadePesquisa === 'rapida' || parsed?.profundidadePesquisa === 'profunda') setProfundidadePesquisa(parsed.profundidadePesquisa);
      if (typeof parsed?.studioOutput === 'string') setStudioOutput(parsed.studioOutput);
    } catch {
      // Se o cache antigo estiver corrompido, a aba começa limpa em vez de quebrar.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontes,
        mensagens,
        historicoPesquisas,
        limiteTempoMs,
        maxFontesPesquisa,
        profundidadePesquisa,
        studioOutput
      }));
    } catch {
      // Cache cheio não pode quebrar a pesquisa.
    }
  }, [fontes, mensagens, historicoPesquisas, limiteTempoMs, maxFontesPesquisa, profundidadePesquisa, studioOutput]);

  const fontesSelecionadas = useMemo(() => fontes.filter(f => f.selecionada), [fontes]);

  const contextoDasFontes = useMemo(() => {
    const bloco = fontesSelecionadas.map((fonte, idx) => (
      `FONTE ${idx + 1}: ${fonte.titulo}\n` +
      `${fonte.url ? `URL: ${fonte.url}\n` : ''}` +
      `TIPO: ${fonte.tipo}\n` +
      `CONTEÚDO:\n${limitar(fonte.conteudo, 6000)}`
    )).join('\n\n---\n\n');
    return limitar(bloco, MAX_CONTEXT_CHARS);
  }, [fontesSelecionadas]);

  const contextoParaVoz = useMemo(() => {
    const titulos = fontesSelecionadas.slice(0, 12).map((f, i) => `${i + 1}. ${f.titulo}${f.url ? ` (${f.url})` : ''}`).join('\n');
    return [
      `OSONE PESQUISA — FONTES ATIVAS: ${fontesSelecionadas.length}`,
      titulos,
      studioOutput ? `\nÚLTIMO RESULTADO DO ESTÚDIO:\n${limitar(studioOutput, 6000)}` : '',
      contextoDasFontes ? `\nTRECHOS DAS FONTES:\n${limitar(contextoDasFontes, 16000)}` : ''
    ].filter(Boolean).join('\n\n');
  }, [contextoDasFontes, fontesSelecionadas, studioOutput]);

  useEffect(() => {
    onContextChange?.(contextoParaVoz);
  }, [contextoParaVoz, onContextChange]);

  const pesquisarFontes = async () => {
    const q = consulta.trim();
    if (!q) return;
    const inicio = Date.now();
    const deadline = inicio + limiteTempoMs;
    let statusHistorico: HistoricoPesquisa['status'] = 'concluida';
    let observacaoHistorico = '';
    let totalEncontradas = 0;
    let totalAdicionadas = 0;
    const novas: FontePesquisa[] = [];
    setCarregandoPesquisa(true);
    setProgressoPesquisa('Preparando investigação...');
    try {
      const urlsParaLer: string[] = [];
      const vistas = new Set(fontes.map(fonteAssinatura));
      const consultas = consultasDeInvestigacao(q, profundidadePesquisa);

      const registrarFonte = (fonte: FontePesquisa | null) => {
        if (!fonte || novas.length >= maxFontesPesquisa) return;
        const assinatura = fonteAssinatura(fonte);
        if (vistas.has(assinatura)) return;
        vistas.add(assinatura);
        novas.push(fonte);
        totalEncontradas += 1;
        if (fonte.url) urlsParaLer.push(fonte.url);
      };

      for (const termo of consultas) {
        if (tempoRestanteAte(deadline) <= 0 || novas.length >= maxFontesPesquisa) break;
        const restante = tempoRestanteAte(deadline);
        setProgressoPesquisa(`Investigando: ${termo}`);

        if (apiKeys.tavilyApiKey) {
          const data = await fetchJsonComTempo<any>('/api/search/tavily', {
            query: termo,
            apiKey: apiKeys.tavilyApiKey,
            maxResults: Math.min(maxFontesPesquisa - novas.length, profundidadePesquisa === 'profunda' ? 12 : 6),
            searchDepth: profundidadePesquisa === 'profunda' ? 'advanced' : 'basic'
          }, Math.min(restante, 25_000));
          for (const item of data?.results || []) {
            registrarFonte(normalizarFonteWeb(item));
          }
          if (data?.answer) {
            registrarFonte({
              id: uid('fonte-resumo'),
              titulo: `Resposta inicial: ${termo}`,
              conteudo: limitar(data.answer, MAX_SOURCE_CHARS),
              tipo: 'texto',
              selecionada: true,
              criadaEm: Date.now()
            });
          }
        }

        if (tempoRestanteAte(deadline) <= 0 || novas.length >= maxFontesPesquisa) break;

        if (!apiKeys.tavilyApiKey && apiKeys.googleCustomSearchApiKey && apiKeys.googleCustomSearchCx) {
          const data = await fetchJsonComTempo<any>('/api/search/custom', {
            query: termo,
            key: apiKeys.googleCustomSearchApiKey,
            cx: apiKeys.googleCustomSearchCx,
            num: Math.min(10, maxFontesPesquisa - novas.length)
          }, Math.min(tempoRestanteAte(deadline), 20_000));
          for (const item of data?.items || []) {
            registrarFonte(normalizarFonteWeb(item));
          }
        }

        if (tempoRestanteAte(deadline) <= 0 || novas.length >= maxFontesPesquisa) break;

        if (!novas.length) {
          const data = await fetchJsonComTempo<any>('/api/gemini/generateContent', {
            clientApiKey: apiKeys.gemini || undefined,
            model: apiKeys.geminiModel || 'gemini-3.7-flash',
            contents: [{ role: 'user', parts: [{ text: `Pesquise fontes confiáveis na web sobre: ${termo}. Traga páginas, estudos, guias ou matérias úteis.` }] }],
            config: { tools: [{ googleSearch: {} }] }
          }, Math.min(tempoRestanteAte(deadline), 25_000));
          const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          for (const chunk of chunks) {
            registrarFonte(normalizarFonteWeb(chunk));
          }
          if (data?.text) {
            registrarFonte({
              id: uid('fonte-resumo'),
              titulo: `Resumo inicial: ${termo}`,
              conteudo: limitar(data.text, MAX_SOURCE_CHARS),
              tipo: 'texto',
              selecionada: true,
              criadaEm: Date.now()
            });
          }
        }
      }

      const urlsUnicas = [...new Set(urlsParaLer)].slice(0, maxFontesPesquisa);
      for (let i = 0; i < urlsUnicas.length; i += 1) {
        if (tempoRestanteAte(deadline) <= 0) {
          statusHistorico = 'tempo_limite';
          observacaoHistorico = 'O tempo máximo foi atingido durante a leitura das páginas.';
          break;
        }
        const url = urlsUnicas[i];
        setProgressoPesquisa(`Lendo fonte ${i + 1}/${urlsUnicas.length}...`);
        try {
          const data = await fetchJsonComTempo<any>('/api/scrape', { url }, Math.min(tempoRestanteAte(deadline), 18_000));
          if (!data?.text) continue;
          const idx = novas.findIndex(f => f.url === url);
          if (idx >= 0) {
            novas[idx] = {
              ...novas[idx],
              conteudo: limitar(`${novas[idx].conteudo}\n\nCONTEÚDO LIDO DA PÁGINA:\n${data.text}`, MAX_SOURCE_CHARS),
              resumo: data.text.slice(0, 300)
            };
          }
        } catch {
          // Página que bloqueia scraping não invalida a busca inteira.
        }
      }

      if (tempoRestanteAte(deadline) <= 0) {
        statusHistorico = 'tempo_limite';
        observacaoHistorico ||= 'O tempo máximo foi atingido; trouxe o material encontrado até aqui.';
      }

      if (!novas.length) {
        onNotification?.('Não encontrei fontes agora. Tente outra busca ou adicione uma fonte manual.', 'error');
        statusHistorico = statusHistorico === 'tempo_limite' ? 'tempo_limite' : 'erro';
        observacaoHistorico ||= 'Nenhuma fonte nova foi adicionada.';
        return;
      }

      const assinaturasAtuais = new Set(fontes.map(fonteAssinatura));
      const filtradas = novas.filter(f => !assinaturasAtuais.has(fonteAssinatura(f)));
      totalAdicionadas = filtradas.length;
      setFontes(prev => [...filtradas, ...prev].slice(0, 120));
      onNotification?.(
        statusHistorico === 'tempo_limite'
          ? `Tempo limite atingido. Trouxe ${novas.length} fonte(s) encontradas até aqui.`
          : `Pesquisa concluída: ${novas.length} fonte(s) encontrada(s).`,
        statusHistorico === 'tempo_limite' ? 'info' : 'success'
      );
    } catch (err: any) {
      statusHistorico = 'erro';
      observacaoHistorico = err?.name === 'AbortError' ? 'Uma etapa excedeu o tempo disponível.' : (err?.message || String(err));
      onNotification?.(`Erro na pesquisa: ${err?.message || String(err)}`, 'error');
    } finally {
      setHistoricoPesquisas(prev => [{
        id: uid('hist'),
        consulta: q,
        criadaEm: inicio,
        duracaoMs: Date.now() - inicio,
        limiteMs: limiteTempoMs,
        fontesEncontradas: totalEncontradas || novas.length,
        fontesAdicionadas: totalAdicionadas || novas.length,
        status: statusHistorico,
        observacao: observacaoHistorico
      }, ...prev].slice(0, 30));
      setProgressoPesquisa('');
      setCarregandoPesquisa(false);
    }
  };

  const adicionarNotaComoFonte = () => {
    const conteudo = notaConteudo.trim();
    if (!conteudo) return;
    setFontes(prev => [{
      id: uid('fonte-texto'),
      titulo: notaTitulo.trim() || 'Nota manual',
      conteudo: limitar(conteudo, MAX_SOURCE_CHARS),
      tipo: 'texto',
      selecionada: true,
      criadaEm: Date.now()
    }, ...prev]);
    setNotaTitulo('');
    setNotaConteudo('');
    onNotification?.('Fonte manual adicionada ao book.', 'success');
  };

  const importarArquivos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(event.target.files || []);
    if (!arquivos.length) return;
    const novas: FontePesquisa[] = [];
    for (const arquivo of arquivos) {
      const texto = await arquivo.text().catch(() => '');
      if (!texto.trim()) continue;
      novas.push({
        id: uid('fonte-arquivo'),
        titulo: arquivo.name,
        conteudo: limitar(texto, MAX_SOURCE_CHARS),
        tipo: 'arquivo',
        selecionada: true,
        criadaEm: Date.now()
      });
    }
    setFontes(prev => [...novas, ...prev]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onNotification?.(`${novas.length} arquivo(s) importado(s) como fonte.`, 'success');
  };

  const perguntarComFontes = async (textoRecebido?: string) => {
    const texto = (textoRecebido || pergunta).trim();
    if (!texto || respondendo) return;
    if (!fontesSelecionadas.length) {
      onNotification?.('Selecione ou adicione fontes antes de perguntar.', 'error');
      return;
    }
    const userMsg: MensagemPesquisa = { id: uid('msg-user'), role: 'user', content: texto, createdAt: Date.now() };
    setMensagens(prev => [...prev, userMsg]);
    setPergunta('');
    setRespondendo(true);
    try {
      const prompt = `Você é o OSONE PESQUISA, um assistente de análise baseado somente nas fontes do book.

REGRAS:
- Use as fontes abaixo como se fossem arquivos de um notebook.
- Se algo não estiver nas fontes, diga que não encontrou nas fontes.
- Cite as fontes pelo número e título quando fizer afirmações importantes.
- Responda em português do Brasil, com clareza e sem inventar.
- Escreva de forma natural, explicativa e contínua, como um pesquisador falando com uma pessoa.
- Não use markdown decorativo: nada de asteriscos, linhas separadoras, cercas de código ou títulos com #.
- Use no máximo 3 subtítulos simples quando ajudar. Prefira parágrafos curtos.
- Quando citar, use formato natural: (Fonte 2: Nome da fonte).

PERGUNTA DO USUÁRIO:
${texto}

FONTES SELECIONADAS:
${contextoDasFontes}`;

      const res = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientApiKey: apiKeys.gemini || undefined,
          model: apiKeys.geminiModel || 'gemini-3.7-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const resposta = limparRespostaNatural(data?.text || data?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || 'Não consegui gerar resposta.');
      setMensagens(prev => [...prev, { id: uid('msg-ai'), role: 'assistant', content: resposta, createdAt: Date.now() }]);
    } catch (err: any) {
      onNotification?.(`Erro ao responder com fontes: ${err?.message || String(err)}`, 'error');
    } finally {
      setRespondendo(false);
    }
  };

  const gerarNoStudio = async (tipo: typeof abaStudio) => {
    if (!fontesSelecionadas.length) {
      onNotification?.('Adicione fontes antes de usar o Estúdio.', 'error');
      return;
    }
    setAbaStudio(tipo);
    setRespondendo(true);
    try {
      const tarefa = {
        relatorio: 'Gere um relatório estruturado, natural e explicativo, com resumo executivo, achados, divergências, riscos, oportunidades e conclusão. Não use asteriscos nem linhas separadoras.',
        tabela: 'Gere uma tabela em Markdown com colunas: Fonte, Evidência, Importância, Observação prática.',
        grafico: 'Gere dados simples para gráfico em texto: categorias e pontuação de 0 a 10 conforme presença/força nas fontes.',
        cartoes: 'Gere cartões didáticos/perguntas e respostas para estudar o conteúdo das fontes.'
      }[tipo];
      const prompt = `${tarefa}

Use somente estas fontes selecionadas:
${contextoDasFontes}`;

      const res = await fetch('/api/gemini/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientApiKey: apiKeys.gemini || undefined,
          model: apiKeys.geminiModel || 'gemini-3.7-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const saidaBruta = data?.text || data?.candidates?.[0]?.content?.parts?.find((p: any) => p.text)?.text || '';
      const saida = tipo === 'tabela' ? saidaBruta.trim() : limparRespostaNatural(saidaBruta);
      setStudioOutput(saida);
      onNotification?.('Estúdio gerou um novo resultado com base nas fontes.', 'success');
    } catch (err: any) {
      onNotification?.(`Erro no Estúdio: ${err?.message || String(err)}`, 'error');
    } finally {
      setRespondendo(false);
    }
  };

  const exportarWord = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>OSONE Pesquisa</title></head><body>
      <h1>OSONE Pesquisa</h1>
      <h2>Resultado</h2>
      <pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escaparHtml(studioOutput || contextoDasFontes || 'Sem conteúdo.')}</pre>
      <h2>Fontes</h2>
      <ol>${fontesSelecionadas.map(f => `<li><strong>${escaparHtml(f.titulo)}</strong>${f.url ? ` — ${escaparHtml(f.url)}` : ''}</li>`).join('')}</ol>
    </body></html>`;
    baixarArquivo('osone-pesquisa.doc', html, 'application/msword;charset=utf-8');
  };

  const exportarCsv = () => {
    const linhas = [['titulo', 'tipo', 'url', 'resumo']];
    for (const fonte of fontesSelecionadas) {
      linhas.push([
        fonte.titulo,
        fonte.tipo,
        fonte.url || '',
        (fonte.resumo || fonte.conteudo.slice(0, 400)).replace(/\s+/g, ' ')
      ]);
    }
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    baixarArquivo('osone-pesquisa-fontes.csv', csv, 'text/csv;charset=utf-8');
  };

  const limparBook = () => {
    if (!confirm('Limpar todas as fontes e conversas desta pesquisa?')) return;
    setFontes([]);
    setMensagens([]);
    setStudioOutput('');
  };

  const fontesPorTipo = useMemo(() => ({
    web: fontesSelecionadas.filter(f => f.tipo === 'web').length,
    texto: fontesSelecionadas.filter(f => f.tipo === 'texto').length,
    arquivo: fontesSelecionadas.filter(f => f.tipo === 'arquivo').length
  }), [fontesSelecionadas]);

  return (
    <div className="w-full flex-1 min-h-0 bg-[#070910] text-white flex flex-col overflow-hidden">
      <header className="shrink-0 px-5 md:px-7 py-4 border-b border-white/10 bg-black/30 backdrop-blur-xl flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 border border-white/10 transition-colors"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-cyan-300">
            <BookOpen size={14} />
            Plano Max
          </div>
          <h2 className="text-lg md:text-2xl font-serif italic font-light truncate">OSONE PESQUISA</h2>
        </div>
        <div className="ml-auto hidden md:flex items-center gap-2 text-[11px] font-mono text-zinc-400">
          <span className="px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-400/20">{fontesSelecionadas.length} fontes ativas</span>
          <span className="px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-200 border border-purple-400/20">book local</span>
        </div>
        {onStartLiveVoice && (
          <button
            onClick={onStartLiveVoice}
            className="p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-400/25"
            title="Conversar por voz com o OSONE sobre este book"
          >
            <Mic size={18} />
          </button>
        )}
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 border-b xl:border-b-0 xl:border-r border-white/10 bg-white/[0.02] flex flex-col">
          <div className="p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-2">
                <Globe2 size={15} className="text-cyan-300" />
                Fontes
              </h3>
              <button onClick={limparBook} className="p-2 rounded-xl hover:bg-red-500/10 text-zinc-500 hover:text-red-300" title="Limpar book">
                <Trash2 size={14} />
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/35 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                <SlidersHorizontal size={13} className="text-cyan-300" />
                Investigação
              </div>
              <textarea
                value={consulta}
                onChange={e => setConsulta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) pesquisarFontes();
                }}
                placeholder="Pesquise novas fontes na web..."
                className="w-full h-20 bg-transparent outline-none resize-none text-sm text-zinc-100 placeholder-zinc-500"
              />
              <button
                onClick={pesquisarFontes}
                disabled={carregandoPesquisa || !consulta.trim()}
                className="w-full py-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/25 text-cyan-200 text-xs font-mono font-bold uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {carregandoPesquisa ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                Iniciar pesquisa
              </button>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="block text-[9px] uppercase tracking-wider text-zinc-500">Fontes</span>
                  <select
                    value={maxFontesPesquisa}
                    onChange={e => setMaxFontesPesquisa(Number(e.target.value))}
                    disabled={carregandoPesquisa}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2 py-2 text-[11px] outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    {OPCOES_MAX_FONTES.map(valor => <option key={valor} value={valor}>{valor}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[9px] uppercase tracking-wider text-zinc-500">Tempo</span>
                  <select
                    value={limiteTempoMs}
                    onChange={e => setLimiteTempoMs(Number(e.target.value))}
                    disabled={carregandoPesquisa}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2 py-2 text-[11px] outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    {OPCOES_TEMPO_PESQUISA.map(opcao => <option key={opcao.value} value={opcao.value}>{opcao.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-[9px] uppercase tracking-wider text-zinc-500">Modo</span>
                  <select
                    value={profundidadePesquisa}
                    onChange={e => setProfundidadePesquisa(e.target.value as 'rapida' | 'profunda')}
                    disabled={carregandoPesquisa}
                    className="w-full bg-black/35 border border-white/10 rounded-xl px-2 py-2 text-[11px] outline-none focus:border-cyan-400/40 disabled:opacity-50"
                  >
                    <option value="rapida">rápida</option>
                    <option value="profunda">profunda</option>
                  </select>
                </label>
              </div>
              {progressoPesquisa && (
                <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100 flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin shrink-0" />
                  <span className="truncate">{progressoPesquisa}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-zinc-300 flex items-center justify-center gap-2"
              >
                <Upload size={14} /> Arquivo
              </button>
              <button
                onClick={adicionarNotaComoFonte}
                disabled={!notaConteudo.trim()}
                className="py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/20 text-xs font-mono text-emerald-200 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Plus size={14} /> Nota
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.json,.html,.css,.js,.ts,.tsx"
              className="hidden"
              onChange={importarArquivos}
            />

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 space-y-2">
              <input
                value={notaTitulo}
                onChange={e => setNotaTitulo(e.target.value)}
                placeholder="Título da fonte manual"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-cyan-400/40"
              />
              <textarea
                value={notaConteudo}
                onChange={e => setNotaConteudo(e.target.value)}
                placeholder="Cole texto, briefing, transcrição, trecho de livro..."
                className="w-full h-20 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none resize-none focus:border-cyan-400/40"
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <History size={13} className="text-purple-300" />
                  Histórico
                </div>
                {historicoPesquisas.length > 0 && (
                  <button
                    onClick={() => setHistoricoPesquisas([])}
                    className="text-[10px] text-zinc-600 hover:text-red-300"
                  >
                    limpar
                  </button>
                )}
              </div>
              {historicoPesquisas.length === 0 ? (
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Suas pesquisas recentes aparecem aqui com tempo usado e fontes encontradas.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                  {historicoPesquisas.slice(0, 8).map(item => (
                    <button
                      key={item.id}
                      onClick={() => setConsulta(item.consulta)}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-2"
                      title={item.observacao || item.consulta}
                    >
                      <span className="block text-[11px] text-zinc-200 truncate">{item.consulta}</span>
                      <span className={cn(
                        "block text-[9px] mt-1 uppercase tracking-wider",
                        item.status === 'erro' ? 'text-red-300' : item.status === 'tempo_limite' ? 'text-amber-300' : 'text-emerald-300'
                      )}>
                        {item.status === 'tempo_limite' ? 'tempo limite' : item.status} · {item.fontesAdicionadas}/{item.fontesEncontradas} fontes · {Math.max(1, Math.round(item.duracaoMs / 1000))}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-2 custom-scrollbar">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              <span>Selecionar fontes</span>
              <button
                onClick={() => setFontes(prev => prev.map(f => ({ ...f, selecionada: true })))}
                className="hover:text-cyan-300"
              >
                todas
              </button>
            </div>
            {fontes.length === 0 ? (
              <div className="p-5 rounded-2xl border border-dashed border-white/10 text-xs text-zinc-500 leading-relaxed">
                Comece pesquisando na web, importando arquivos ou colando uma fonte manual.
              </div>
            ) : fontes.map(fonte => (
              <button
                key={fonte.id}
                onClick={() => setFontes(prev => prev.map(f => f.id === fonte.id ? { ...f, selecionada: !f.selecionada } : f))}
                className={cn(
                  "w-full text-left p-3 rounded-2xl border transition-all group",
                  fonte.selecionada ? "bg-cyan-500/10 border-cyan-400/25" : "bg-black/20 border-white/10 opacity-60"
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn("mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center shrink-0", fonte.selecionada ? "border-cyan-300 text-cyan-200" : "border-white/20 text-transparent")}>
                    <Check size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-zinc-100 truncate">{fonte.titulo}</span>
                    <span className="block text-[10px] text-zinc-500 mt-1 truncate">{fonte.url || fonte.tipo}</span>
                    <span className="block text-[11px] text-zinc-400 mt-2 line-clamp-2">{fonte.resumo || fonte.conteudo}</span>
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setFontes(prev => prev.filter(f => f.id !== fonte.id));
                    }}
                    className="p-1 rounded-lg text-zinc-600 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100"
                  >
                    <X size={13} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="min-h-0 flex flex-col border-b xl:border-b-0 xl:border-r border-white/10">
          <div className="shrink-0 px-5 py-3 border-b border-white/10 bg-black/20 flex items-center gap-3">
            <MessageSquareText size={16} className="text-cyan-300" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold">Conversa com as fontes</h3>
              <p className="text-[11px] text-zinc-500 truncate">O modelo responde olhando apenas o book selecionado.</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 custom-scrollbar">
            {mensagens.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <div className="max-w-md space-y-3">
                  <Sparkles className="mx-auto text-cyan-300" size={28} />
                  <h3 className="text-xl font-serif italic">Monte um book de fontes e pergunte sobre ele</h3>
                  <p className="text-sm text-zinc-500">Pesquise, selecione fontes e peça sínteses, comparação, planos, fichamentos ou relatórios.</p>
                  <button
                    onClick={() => setPergunta(exemploDePergunta)}
                    className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-zinc-300"
                  >
                    Usar pergunta exemplo
                  </button>
                </div>
              </div>
            ) : mensagens.map(msg => (
              <div key={msg.id} className={cn("max-w-[86%] rounded-3xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap", msg.role === 'user' ? "ml-auto bg-cyan-500/15 border border-cyan-400/20" : "mr-auto bg-white/[0.04] border border-white/10")}>
                {msg.content}
              </div>
            ))}
            {respondendo && (
              <div className="mr-auto rounded-3xl px-4 py-3 bg-white/[0.04] border border-white/10 text-sm text-zinc-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-cyan-300" />
                Lendo fontes...
              </div>
            )}
          </div>
          <div className="shrink-0 p-4 border-t border-white/10 bg-black/35">
            <div className="rounded-2xl border border-white/10 bg-[#080a12] p-2 flex items-end gap-2">
              <textarea
                value={pergunta}
                onChange={e => setPergunta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) perguntarComFontes();
                }}
                placeholder={`Pergunte sobre ${fontesSelecionadas.length || 'as'} fontes...`}
                className="flex-1 min-h-[52px] max-h-32 bg-transparent outline-none resize-none px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600"
              />
              <button
                onClick={() => perguntarComFontes()}
                disabled={!pergunta.trim() || respondendo}
                className="px-4 py-3 rounded-xl bg-cyan-400 text-black text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </div>
        </main>

        <aside className="min-h-0 bg-white/[0.02] flex flex-col">
          <div className="p-4 border-b border-white/10 shrink-0">
            <h3 className="text-sm font-bold font-mono uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={15} className="text-purple-300" />
              Estúdio
            </h3>
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { id: 'relatorio', label: 'Relatório', icon: ClipboardList },
                { id: 'tabela', label: 'Tabela', icon: Table2 },
                { id: 'grafico', label: 'Gráfico', icon: BarChart3 },
                { id: 'cartoes', label: 'Cartões', icon: FilePlus2 }
              ].map(item => {
                const Icone = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => gerarNoStudio(item.id as typeof abaStudio)}
                    disabled={respondendo}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition-all disabled:opacity-50",
                      abaStudio === item.id ? "bg-purple-500/15 border-purple-400/30 text-purple-100" : "bg-black/25 border-white/10 text-zinc-300 hover:bg-white/[0.05]"
                    )}
                  >
                    <Icone size={16} />
                    <span className="block mt-2 text-xs font-bold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 grid grid-cols-3 gap-2 border-b border-white/10 shrink-0 text-center">
            <div className="rounded-2xl bg-black/25 border border-white/10 p-2">
              <div className="text-lg font-bold text-cyan-200">{fontesPorTipo.web}</div>
              <div className="text-[9px] text-zinc-500 uppercase">web</div>
            </div>
            <div className="rounded-2xl bg-black/25 border border-white/10 p-2">
              <div className="text-lg font-bold text-emerald-200">{fontesPorTipo.arquivo}</div>
              <div className="text-[9px] text-zinc-500 uppercase">arquivos</div>
            </div>
            <div className="rounded-2xl bg-black/25 border border-white/10 p-2">
              <div className="text-lg font-bold text-purple-200">{fontesPorTipo.texto}</div>
              <div className="text-[9px] text-zinc-500 uppercase">notas</div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {studioOutput ? (
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-200 font-sans bg-black/25 border border-white/10 rounded-2xl p-4">{studioOutput}</pre>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-sm text-zinc-500 leading-relaxed">
                <div>
                  <FileText size={30} className="mx-auto mb-3 text-zinc-600" />
                  O resultado do Estúdio aparece aqui depois de incluir fontes e escolher Relatório, Tabela, Gráfico ou Cartões.
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-white/10 shrink-0 grid grid-cols-2 gap-2">
            <button
              onClick={exportarWord}
              className="py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/25 text-cyan-200 text-xs font-mono flex items-center justify-center gap-2"
            >
              <Download size={14} /> Word
            </button>
            <button
              onClick={exportarCsv}
              className="py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/25 text-emerald-200 text-xs font-mono flex items-center justify-center gap-2"
            >
              <Table2 size={14} /> CSV
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
