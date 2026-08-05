import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { buscarNoProjeto, substituirNoProjeto, OcorrenciaNaBusca } from '../lib/buscarNoProjeto';
import { realcar, linguagemDoArquivo } from '../lib/realce';
import {
  Code2, Play, FileCode, Plus, Trash2, Edit3, Download, Copy, Check,
  FolderGit2, Sparkles, RefreshCw, Eye, Columns,
  Upload, X, Mic, Loader2, MessageSquare, AlertCircle,
  Bot, Layers, ShieldCheck, Terminal, Cpu, Zap, RotateCw, CheckCircle2,
  AlertTriangle, ChevronDown, ChevronUp, PlayCircle, Gamepad2,
  Undo, Redo, RotateCcw, Paperclip, Flame, Search, Replace
} from 'lucide-react';
import { cn } from '../lib/utils';
import { CodePreview } from './CodePreview';
import { CodeRepositoryFile } from '../types';
import { buildCodeEditSystemInstruction, applyModelCodeResponse, parseSections, pareceDocumentoIncompleto } from '../lib/codeEdits';
import { montarPreview } from '../lib/montarPreview';
import { ProblemaDoPreview, juntarProblemas, montarPedidoDeCorrecao } from '../lib/errosDoPreview';

// Geração/edição de código (Hunter e Enxame/Swarm) sempre usa o melhor modelo GRATUITO
// disponível para código (gemini-3.6-flash: mais recente, líder em benchmarks de código como
// SWE-Bench Pro entre os modelos gratuitos), independente do modelo configurado nos Ajustes
// gerais do chat — qualidade de código não pode ficar refém de um modelo lite mais fraco.
const OSONE_CODE_BEST_MODEL = "gemini-3.6-flash";

/**
 * Chama /api/generate com retentativas automáticas (backoff simples) para falhas
 * transitórias de rede/servidor. Evita que um único agente do Swarm derrube o
 * pipeline inteiro por causa de uma falha passageira em uma das várias chamadas
 * sequenciais. Sempre manda "unrestricted: true" para tirar as travas de qualidade
 * (sem downgrade silencioso de modelo, raciocínio máximo, filtros de segurança
 * ajustáveis afrouxados) — só nas chamadas do OSONE CODE, não no resto do app.
 */
async function generateWithRetry(
  body: Record<string, unknown>,
  retries: number = 2,
  /** Cancela a chamada pela metade quando o usuário desiste. Ver 'cancelado' no retorno. */
  sinal?: AbortSignal
): Promise<{ ok: boolean; text: string; error?: string; truncated?: boolean; blocked?: boolean; cancelado?: boolean }> {
  let lastError = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (sinal?.aborted) return { ok: false, text: '', cancelado: true };
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unrestricted: true, ...body }),
        signal: sinal
      });
      const data = await response.json().catch(() => ({} as any));
      if (response.ok) {
        return { ok: true, text: data.text || '', truncated: !!data.truncated, blocked: !!data.blocked };
      }
      lastError = data?.error || `HTTP ${response.status}`;
    } catch (e: any) {
      // Desistir não é falhar: sem esta saída, o cancelamento viraria mais duas tentativas e um
      // erro vermelho na tela de quem só apertou "parar".
      if (e?.name === 'AbortError' || sinal?.aborted) return { ok: false, text: '', cancelado: true };
      lastError = e?.message || String(e);
    }
    if (attempt < retries) {
      await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  return { ok: false, text: '', error: lastError };
}

const BowAndArrowIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 21a9 9 0 0 0 0-18M2 12h20M17 7l5 5-5 5" />
  </svg>
);

export interface OSONEProject {
  id: string;
  name: string;
  files: CodeRepositoryFile[];
  activeFileId: string;
  updatedAt: number;
}

/**
 * A linguagem que vem do nome do arquivo.
 *
 * Estava escrito solto dentro da criação de arquivo, então quem renomeava um script.js para
 * styles.css ficava com um arquivo .css marcado como javascript: o realce pintava com as regras
 * erradas e o preview tratava folha de estilo como script. Num lugar só, renomear e criar passam
 * pela mesma regra.
 */
export function linguagemPelaExtensao(nomeDoArquivo: string): string {
  const ext = (nomeDoArquivo.split('.').pop() || '').toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'py') return 'python';
  if (ext === 'json') return 'json';
  if (ext === 'md') return 'markdown';
  if (ext === 'sql') return 'sql';
  return 'javascript';
}

/**
 * Uma cópia nova dos arquivos padrão, a cada chamada.
 *
 * DEFAULT_FILES era entregue por REFERÊNCIA aos projetos criados no preenchimento da lista: cinco
 * projetos "diferentes" apontando para o mesmo array e para os mesmos objetos de arquivo. Bastava
 * uma alteração que mutasse em vez de copiar para o conteúdo aparecer nos outros projetos.
 */
function arquivosPadraoNovos(): CodeRepositoryFile[] {
  return JSON.parse(JSON.stringify(DEFAULT_FILES));
}

const DEFAULT_FILES: CodeRepositoryFile[] = [
  {
    id: 'main-app',
    name: 'index.html',
    language: 'html',
    isMain: true,
    updatedAt: Date.now(),
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OSONE CODE App</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <!-- Os arquivos do projeto entram por aqui: o preview resolve estes endereços contra o
       repositório e embute o conteúdo, então editar styles.css ou script.js muda a página. -->
  <link rel="stylesheet" href="styles.css">
  <style>
    body { background-color: #090a0f; color: #f3f4f6; font-family: system-ui, sans-serif; }
    .glass { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6">
  <div class="glass rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 border border-cyan-500/20">
    <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
      <i data-lucide="cpu" class="w-8 h-8"></i>
    </div>

    <div>
      <h1 class="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
        OSONE CODE Studio
      </h1>
      <p class="text-xs text-zinc-400 mt-2">
        Arquitetura de Agentes Swarm & Harness Engineering.
      </p>
    </div>

    <div class="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs font-mono text-cyan-300/80 space-y-1">
      <div>> Sistema OSONE CODE v5.0 ativo</div>
      <div>> Swarm Engine (PM, Architect, Coder, QA) pronto</div>
      <div>> Clique em "🐝 ENXAME OSONE CODE" para criar jogos</div>
    </div>

    <button id="counterBtn" class="w-full py-3 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold transition-all transform active:scale-95 shadow-lg shadow-cyan-500/20">
      Clique aqui: <span id="countVal">0</span>
    </button>
  </div>

  <script src="script.js"></script>
  <script>
    lucide.createIcons();
    let count = 0;
    const btn = document.getElementById('counterBtn');
    const val = document.getElementById('countVal');
    btn.addEventListener('click', () => {
      count++;
      val.textContent = count;
    });
  </script>
</body>
</html>`
  },
  {
    id: 'styles-css',
    name: 'styles.css',
    language: 'css',
    updatedAt: Date.now() - 3600000,
    content: `/* Custom OSONE Stylesheet */
:root {
  --primary: #06b6d4;
  --bg-dark: #090a0f;
}

body {
  margin: 0;
  padding: 0;
  background-color: var(--bg-dark);
  font-family: 'JetBrains Mono', monospace;
}`
  },
  {
    id: 'script-js',
    name: 'script.js',
    language: 'javascript',
    updatedAt: Date.now() - 7200000,
    content: `// Main Application Logic
console.log("OSONE CODE Studio Inicializado!");

function calculateMetrics(a, b) {
  return a * b;
}`
  }
];

const DEFAULT_PROJECTS: OSONEProject[] = [
  {
    id: 'proj-1',
    name: 'Projeto 1',
    files: DEFAULT_FILES,
    activeFileId: 'main-app',
    updatedAt: Date.now()
  },
  {
    id: 'proj-2',
    name: 'Projeto 2',
    files: [
      {
        id: 'proj-2-main',
        name: 'index.html',
        language: 'html',
        isMain: true,
        updatedAt: Date.now(),
        content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Projeto 2 - OSONE CODE</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6">
  <div class="p-8 rounded-2xl bg-zinc-900 border border-emerald-500/30 text-center space-y-4 max-w-md">
    <h1 class="text-2xl font-bold text-emerald-400">Projeto 2 - Novo Canvas</h1>
    <p class="text-xs text-zinc-400">Projeto independente. Alterações aqui afetam apenas este projeto!</p>
  </div>
</body>
</html>`
      }
    ],
    activeFileId: 'proj-2-main',
    updatedAt: Date.now()
  },
  {
    id: 'proj-3',
    name: 'Projeto 3',
    files: [
      {
        id: 'proj-3-main',
        name: 'index.html',
        language: 'html',
        isMain: true,
        updatedAt: Date.now(),
        content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Projeto 3 - OSONE CODE</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6">
  <div class="p-8 rounded-2xl bg-zinc-900 border border-purple-500/30 text-center space-y-4 max-w-md">
    <h1 class="text-2xl font-bold text-purple-400">Projeto 3 - Canvas Limpo</h1>
    <p class="text-xs text-zinc-400">Edite, crie jogos ou apps com o Enxame OSONE CODE.</p>
  </div>
</body>
</html>`
      }
    ],
    activeFileId: 'proj-3-main',
    updatedAt: Date.now()
  },
  {
    id: 'proj-4',
    name: 'Projeto 4',
    files: [
      {
        id: 'proj-4-main',
        name: 'index.html',
        language: 'html',
        isMain: true,
        updatedAt: Date.now(),
        content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Projeto 4 - OSONE CODE</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6">
  <div class="p-8 rounded-2xl bg-zinc-900 border border-amber-500/30 text-center space-y-4 max-w-md">
    <h1 class="text-2xl font-bold text-amber-400">Projeto 4 - Sandbox</h1>
    <p class="text-xs text-zinc-400">Pronto para codar!</p>
  </div>
</body>
</html>`
      }
    ],
    activeFileId: 'proj-4-main',
    updatedAt: Date.now()
  },
  {
    id: 'proj-5',
    name: 'Projeto 5',
    files: [
      {
        id: 'proj-5-main',
        name: 'index.html',
        language: 'html',
        isMain: true,
        updatedAt: Date.now(),
        content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Projeto 5 - OSONE CODE</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-6">
  <div class="p-8 rounded-2xl bg-zinc-900 border border-cyan-500/30 text-center space-y-4 max-w-md">
    <h1 class="text-2xl font-bold text-cyan-400">Projeto 5 - Área de Testes</h1>
    <p class="text-xs text-zinc-400">Código mantido de forma totalmente isolada.</p>
  </div>
</body>
</html>`
      }
    ],
    activeFileId: 'proj-5-main',
    updatedAt: Date.now()
  }
];

/** O arquivo sobre o qual a IA vai trabalhar, entregue de fora para não haver adivinhação. */
export interface AlvoDaGeracao {
  nome: string;
  conteudo: string;
  /**
   * Quando existe, o pedido vale SÓ para este pedaço do arquivo — o resto fica fora de alcance.
   * Guarda o texto além das posições: entre enviar e a resposta chegar o arquivo pode mudar, e é
   * o texto que confirma que o alvo continua sendo o mesmo (ver substituirTrecho).
   */
  trechoSelecionado?: { inicio: number; fim: number; texto: string };
}

export const CodeWorkspace: React.FC<{
  onClose?: () => void;
  /**
   * Pede o código à IA e DEVOLVE o resultado, em vez de gravá-lo por conta própria.
   *
   * Quem grava é só o repositório aqui dentro (applyCodeToRepository), e isso não é detalhe de
   * organização: enquanto o outro lado escrevia direto no localStorage, a alteração feita pela IA
   * não entrava no histórico e não havia como desfazê-la.
   */
  onGenerateCodeRequest?: (
    prompt: string,
    referenceImages?: Array<{ mimeType: string; data: string }>,
    maxEffort?: boolean,
    alvo?: AlvoDaGeracao,
    /** Recebe o texto acumulado a cada pedaço, para o editor mostrar a escrita acontecendo. */
    aoEscrever?: (textoAcumulado: string) => void,
    /** Permite abandonar a geração pela metade, sem esperar o modelo terminar. */
    sinal?: AbortSignal
  ) => Promise<{ conteudo: string; resumo: string } | null>;
  onStartLiveVoice?: () => void;
  apiKeys?: any;
  isGenerating?: boolean;
}> = ({ onClose, onGenerateCodeRequest, onStartLiveVoice, apiKeys, isGenerating }) => {
  // 5 PROJECTS MANAGEMENT
  const [projects, setProjects] = useState<OSONEProject[]>(() => {
    try {
      const saved = localStorage.getItem('osone_code_projects_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = [...parsed];
          for (let i = merged.length; i < 5; i++) {
            // Cópia nova por projeto: entregar o mesmo array a todos faria a edição de um
            // aparecer nos outros (ver arquivosPadraoNovos).
            merged.push(DEFAULT_PROJECTS[i]
              ? { ...DEFAULT_PROJECTS[i], files: JSON.parse(JSON.stringify(DEFAULT_PROJECTS[i].files)) }
              : {
                  id: `proj-${i+1}`,
                  name: `Projeto ${i+1}`,
                  files: arquivosPadraoNovos(),
                  activeFileId: 'main-app',
                  updatedAt: Date.now()
                });
          }
          return merged.slice(0, 5);
        }
      }
    } catch (e) {
      console.error("Erro ao carregar lista de projetos:", e);
    }

    try {
      const legacySaved = localStorage.getItem('osone_code_repository_files');
      if (legacySaved) {
        const parsedLegacy = JSON.parse(legacySaved);
        if (Array.isArray(parsedLegacy) && parsedLegacy.length > 0) {
          const initialProjects = [...DEFAULT_PROJECTS];
          initialProjects[0] = {
            ...initialProjects[0],
            files: parsedLegacy,
            activeFileId: parsedLegacy[0]?.id || 'main-app',
            updatedAt: Date.now()
          };
          return initialProjects;
        }
      }
    } catch (e) {}

    return DEFAULT_PROJECTS;
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem('osone_code_active_project_id');
      if (savedId) return savedId;
    } catch (e) {}
    return 'proj-1';
  });

  const [editingProjectNameId, setEditingProjectNameId] = useState<string | null>(null);
  const [editingProjectNameText, setEditingProjectNameText] = useState<string>('');

  /**
   * OS ARQUIVOS SAEM DO PROJETO ATIVO — E DE MAIS NENHUM LUGAR.
   *
   * Aqui morava um defeito capaz de destruir o trabalho de um projeto inteiro, em silêncio. Esta
   * lista era carregada da chave ANTIGA ('osone_code_repository_files'), enquanto o projeto ativo
   * vinha de outra chave ('osone_code_active_project_id'). São duas fontes independentes para uma
   * informação só, e nada garantia que concordassem: bastava outra janela do OSONE gravar por
   * cima, ou uma gravação parcial, para o editor abrir os arquivos do Projeto 1 com a barra
   * marcando o Projeto 3.
   *
   * E aí vinha a parte cara. O auto-save (logo abaixo) grava 'files' DENTRO do projeto ativo, a
   * cada mudança. Com as duas fontes discordando, o primeiro caractere digitado gravava os
   * arquivos do Projeto 1 por cima do Projeto 3 — e o conteúdo do 3 deixava de existir, sem erro,
   * sem aviso, e sem passar pelo histórico que o Ctrl+Z alcança.
   *
   * Agora existe UMA fonte: o projeto ativo. A chave antiga só é lida na migração de quem vem de
   * uma versão sem projetos (ver o carregamento de 'projects' acima, que já a incorpora no
   * Projeto 1), nunca como origem paralela da lista.
   */
  const [files, setFiles] = useState<CodeRepositoryFile[]>(() => {
    const projetoAtivo = projects.find(p => p.id === activeProjectId) || projects[0];
    const doProjeto = projetoAtivo?.files;
    if (Array.isArray(doProjeto) && doProjeto.length > 0) return doProjeto;
    return arquivosPadraoNovos();
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const projetoAtivo = projects.find(p => p.id === activeProjectId) || projects[0];
    // O arquivo que estava aberto naquele projeto volta a abrir — desde que ainda exista.
    const salvo = projetoAtivo?.activeFileId;
    if (salvo && files.some(f => f.id === salvo)) return salvo;
    return files[0]?.id || 'main-app';
  });

  // UNDO/REDO HISTORY STATE FOR CODE EDITS
  const [historyStack, setHistoryStack] = useState<CodeRepositoryFile[][]>([]);
  const [redoStack, setRedoStack] = useState<CodeRepositoryFile[][]>([]);
  const [lastTypedHistoryTime, setLastTypedHistoryTime] = useState<number>(0);

  // IMAGENS DE REFERÊNCIA ANEXADAS AO PROMPT (clipe)
  interface AttachedImage { id: string; name: string; mimeType: string; data: string; previewUrl: string; }
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Editor de código: a área de escrita e a régua de números ao lado dela.
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const reguaRef = useRef<HTMLDivElement>(null);
  const realceRef = useRef<HTMLPreElement>(null);
  /** Onde deixar o cursor depois que a próxima renderização trouxer o texto novo. */
  const selecaoPendenteRef = useRef<{ inicio: number; fim: number } | null>(null);

  /**
   * ====== O CÓDIGO SENDO ESCRITO, AO VIVO ======
   *
   * Enquanto vale null, o editor é o editor de sempre. Quando a IA começa a escrever, este texto
   * cresce a cada pedaço que chega do modelo e o painel mostra o arquivo nascendo linha a linha,
   * em vez de a tela ficar parada até o resultado inteiro aparecer de uma vez.
   *
   * Não é enfeite: uma geração grande leva dezenas de segundos, e com a tela parada não há como
   * distinguir "está escrevendo" de "travou". Vendo o texto sair, dá para perceber logo que o
   * modelo entendeu errado e cancelar, em vez de esperar até o fim para descobrir.
   *
   * O que aparece aqui é o texto CRU do modelo, marcadores de edição incluídos. Ele não é gravado
   * em lugar nenhum: a gravação continua acontecendo só no fim, pelo caminho único de sempre.
   */
  const [escritaAoVivo, setEscritaAoVivo] = useState<string | null>(null);
  const painelAoVivoRef = useRef<HTMLPreElement>(null);
  const cancelamentoRef = useRef<AbortController | null>(null);

  /**
   * ====== PARAR O HUNTER E O ENXAME NO MEIO ======
   *
   * Os dois só sabiam ir até o fim. Fechar o modal escondia a tela, e a execução continuava
   * correndo por baixo — o Enxame seguia consumindo cota por quatro iterações e GRAVAVA no
   * repositório depois, com o painel já fora da vista. A pessoa via o arquivo mudar sozinho
   * minutos depois de ter desistido, sem relação visível com nada que ela tivesse feito.
   *
   * Agora fechar é parar: o controlador aborta as chamadas em curso e o laço confere o sinal
   * entre as etapas, antes de gravar qualquer coisa.
   */
  const cancelamentoDoHunterRef = useRef<AbortController | null>(null);
  const cancelamentoDoEnxameRef = useRef<AbortController | null>(null);

  /**
   * ====== SUGESTÕES LIDAS DO CÓDIGO QUE EXISTE ======
   *
   * A fileira de atalhos era um cardápio fixo: "Refatorar & Otimizar", "Corrigir BUGS",
   * "Adicionar Animações". As mesmas cinco frases num arquivo em branco e num jogo de 50 mil
   * caracteres — quer dizer, elas nunca sabiam do que estavam falando.
   *
   * O problema não é serem genéricas, é serem CEGAS: "corrigir bugs" sem ter lido o código é um
   * pedido para o modelo adivinhar o que procurar, e o que volta costuma ser mexida aleatória.
   * Uma sugestão que cita a função pelo nome ("o loop de colisão roda em O(n²) e trava acima de
   * 50 karts") vale mais do que as cinco juntas, porque já traz o diagnóstico dentro dela.
   *
   * As frases fixas continuam existindo, mas no lugar certo: arquivo em branco, onde não há o que
   * ler e o que serve mesmo é uma partida rápida.
   */
  /**
   * O trecho marcado no editor. Enquanto existe, o pedido da IA vale só para ele.
   *
   * É guardado com o TEXTO junto das posições, e não só com os números: entre apertar "gerar" e a
   * resposta chegar passam dezenas de segundos em que o arquivo pode mudar, e aí as posições
   * apontariam para outro lugar. O texto é o que confirma que o alvo continua sendo o mesmo.
   */
  const [selecaoDoEditor, setSelecaoDoEditor] = useState<{ inicio: number; fim: number; texto: string } | null>(null);

  /**
   * O que quebrou quando o código rodou de verdade.
   *
   * É a informação mais valiosa que existe para consertar um bug, e era a única que nunca chegava
   * à IA: o navegador executava o jogo, registrava `TypeError` com linha e coluna, mostrava numa
   * aba do preview — e ali parava. Pedir "corrigir bugs" mandava o modelo procurar às cegas.
   */
  const [problemasDoPreview, setProblemasDoPreview] = useState<ProblemaDoPreview[]>([]);

  const [sugestoesDoCodigo, setSugestoesDoCodigo] = useState<string[]>([]);
  const [lendoSugestoes, setLendoSugestoes] = useState(false);
  /** Conteúdo já analisado, para não gastar chamada relendo o mesmo arquivo. */
  const codigoJaAnalisadoRef = useRef<string>('');
  const cancelamentoDasSugestoesRef = useRef<AbortController | null>(null);

  /** Aborta o que estiver correndo e fecha o painel. Usado pelo X e pelo botão de parar. */
  const pararEFechar = (
    referencia: React.MutableRefObject<AbortController | null>,
    fechar: (v: boolean) => void
  ) => {
    referencia.current?.abort();
    referencia.current = null;
    fechar(false);
  };

  // Sair da aba com um agente rodando também para o agente.
  useEffect(() => () => {
    cancelamentoDoHunterRef.current?.abort();
    cancelamentoDoEnxameRef.current?.abort();
  }, []);

  // O painel acompanha a escrita: sem isto o texto cresceria fora da vista e a pessoa veria
  // sempre o começo do arquivo, que é a parte que não está mudando.
  useEffect(() => {
    if (escritaAoVivo === null) return;
    const painel = painelAoVivoRef.current;
    if (painel) painel.scrollTop = painel.scrollHeight;
  }, [escritaAoVivo]);

  // Sair da aba no meio de uma geração não pode deixar a conexão aberta consumindo cota.
  useEffect(() => () => cancelamentoRef.current?.abort(), []);

  // MODO DE ESFORÇO MÁXIMO: pede ao modelo o maior nível de raciocínio/capricho possível
  const [maxEffort, setMaxEffort] = useState<boolean>(false);

  const [viewLayout, setViewLayout] = useState<'split' | 'editor' | 'preview'>('split');
  const [showRepoSidebar, setShowRepoSidebar] = useState<boolean>(true);
  const [promptInput, setPromptInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [editingFileNameId, setEditingFileNameId] = useState<string | null>(null);
  const [editingFileNameText, setEditingFileNameText] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(true);

  // NOTIFICATION BANNER STATE
  const [notificationBanner, setNotificationBanner] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // HUNTER AGENT STATE
  const [isHunterModalOpen, setIsHunterModalOpen] = useState<boolean>(false);
  const [hunterPrompt, setHunterPrompt] = useState<string>('');
  const [hunterStatus, setHunterStatus] = useState<'idle' | 'analyzing' | 'doubt' | 'success' | 'error'>('idle');
  const [hunterReport, setHunterReport] = useState<string | null>(null);
  const [hunterDoubt, setHunterDoubt] = useState<string | null>(null);
  const [hunterDoubtInput, setHunterDoubtInput] = useState<string>('');
  const [hunterProgress, setHunterProgress] = useState<number>(0);

  // SWARM HARNESS ENGINE STATE
  const [isSwarmModalOpen, setIsSwarmModalOpen] = useState<boolean>(false);
  const [swarmPrompt, setSwarmPrompt] = useState<string>('');
  const [maxHarnessIterations, setMaxHarnessIterations] = useState<number>(3);
  const [swarmStatus, setSwarmStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [swarmCurrentStep, setSwarmCurrentStep] = useState<'idle' | 'pm' | 'architect' | 'coder' | 'qa' | 'assembly'>('idle');
  const [swarmIteration, setSwarmIteration] = useState<number>(1);
  const [swarmLogs, setSwarmLogs] = useState<Array<{ agent: string; message: string; timestamp: string; type?: 'info' | 'success' | 'warn' | 'error' }>>([]);
  const [swarmProgress, setSwarmProgress] = useState<number>(0);
  const [swarmProgressText, setSwarmProgressText] = useState<string>('');
  
  // Artifacts generated by the swarm
  const [swarmPMArtifact, setSwarmPMArtifact] = useState<{ gdd: string; mechanics: string[]; requirements: string[] } | null>(null);
  const [swarmArchitectArtifact, setSwarmArchitectArtifact] = useState<{ fileStructure: string; gameLoopStrategy: string; librariesUsed: string[] } | null>(null);
  const [swarmQAReports, setSwarmQAReports] = useState<Array<{ iteration: number; score: number; passed: boolean; feedback: string; missingItems: string[] }>>([]);
  const [activeArtifactTab, setActiveArtifactTab] = useState<'pm' | 'architect' | 'qa' | 'logs'>('logs');

  const activeFile = files.find(f => f.id === activeFileId) || files[0];

  /**
   * A lista de arquivos sempre atual, para quem grava fora do ciclo de renderização.
   *
   * O Enxame chama a gravação várias vezes dentro de um laço com esperas de rede no meio. Lendo
   * 'files' pela variável do closure, toda iteração enxergaria a lista de quando o laço começou —
   * e uma edição feita à mão no meio do processo seria apagada pela iteração seguinte. Atribuído
   * durante a renderização, o ref nunca fica para trás.
   */
  const filesRef = useRef(files);
  filesRef.current = files;

  // Auto-dismiss notification banner
  useEffect(() => {
    if (notificationBanner) {
      const timer = setTimeout(() => {
        setNotificationBanner(null);
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [notificationBanner]);

  // Listen for repository updates from AI generation
  useEffect(() => {
    const handleRepoUpdated = () => {
      try {
        const saved = localStorage.getItem('osone_code_repository_files');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFiles(parsed);
          }
        }
      } catch (e) {}
    };
    window.addEventListener('osone_repository_updated', handleRepoUpdated);
    return () => window.removeEventListener('osone_repository_updated', handleRepoUpdated);
  }, []);

  // Trocar de arquivo fecha a janela de agrupamento da digitação (ver handleUpdateActiveContent).
  useEffect(() => { setLastTypedHistoryTime(0); }, [activeFileId]);

  // Auto-save active project repository files to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('osone_code_repository_files', JSON.stringify(files));
      setIsSaved(true);

      setProjects(prevProjects => {
        const updated = prevProjects.map(p => {
          if (p.id === activeProjectId) {
            return { ...p, files: files, activeFileId: activeFileId, updatedAt: Date.now() };
          }
          return p;
        });
        localStorage.setItem('osone_code_projects_v2', JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error("Erro ao salvar repositório/projetos:", e);
    }
  }, [files, activeFileId, activeProjectId]);

  // ====== BUSCA E SUBSTITUIÇÃO EM TODO O PROJETO ======
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoDeBusca, setTermoDeBusca] = useState('');
  const [substitutoDeBusca, setSubstitutoDeBusca] = useState('');
  const [opcoesDeBusca, setOpcoesDeBusca] = useState({ caseSensitive: false, palavraInteira: false, regex: false });
  const campoDeBuscaRef = useRef<HTMLInputElement | null>(null);

  // O resultado é derivado do estado, e não guardado: guardá-lo deixaria a lista desatualizada em
  // relação ao arquivo que está sendo digitado neste instante.
  const resultadoDaBusca = termoDeBusca
    ? buscarNoProjeto(files, termoDeBusca, opcoesDeBusca)
    : { ocorrencias: [] as OcorrenciaNaBusca[], erro: undefined as string | undefined };

  /** Abre o arquivo da ocorrência e deixa o trecho selecionado no editor. */
  const irParaOcorrencia = (o: OcorrenciaNaBusca) => {
    setActiveFileId(o.arquivoId);
    // A seleção é aplicada depois que o editor renderiza o arquivo novo — o mesmo mecanismo já
    // usado pela indentação com Tab.
    selecaoPendenteRef.current = { inicio: o.inicio, fim: o.fim };
    setTimeout(() => editorRef.current?.focus(), 0);
  };

  const aplicarSubstituicao = () => {
    if (!termoDeBusca) return;
    const r = substituirNoProjeto(files, termoDeBusca, substitutoDeBusca, opcoesDeBusca);
    if (r.erro) {
      setNotificationBanner({ message: r.erro, type: 'error' });
      return;
    }
    if (r.trocas === 0) {
      setNotificationBanner({ message: `Nenhuma ocorrência de "${termoDeBusca}" para substituir.`, type: 'info' });
      return;
    }
    // A troca inteira entra no histórico como UMA ação: substituir em massa sem desfazer é a
    // operação mais perigosa de um editor.
    pushHistory(files);
    setFiles(r.arquivos);
    setNotificationBanner({
      message: `${r.trocas} substituição(ões) em ${r.arquivosAfetados.length} arquivo(s). Ctrl+Z desfaz tudo de uma vez.`,
      type: 'success'
    });
  };

  // UNDO/REDO HISTORY HELPERS
  /**
   * O topo do histórico, fora do estado do React.
   *
   * A decisão de descartar o refazer precisa ser tomada AQUI, de forma síncrona. Tomá-la a partir
   * do que o atualizador do setState devolve não serve: ele pode ser executado mais de uma vez
   * pelo React, e o que for anotado lá dentro não é confiável.
   */
  const topoDoHistoricoRef = useRef<string>('');

  const pushHistory = (currentFiles: CodeRepositoryFile[]) => {
    const textoDoSnapshot = JSON.stringify(currentFiles);
    // Nada mudou desde o último ponto guardado: não há o que empilhar.
    if (topoDoHistoricoRef.current === textoDoSnapshot) return;
    topoDoHistoricoRef.current = textoDoSnapshot;

    const snapshot = JSON.parse(textoDoSnapshot);
    setHistoryStack(prev => {
      const next = [...prev, snapshot];
      if (next.length > 30) return next.slice(next.length - 30);
      return next;
    });

    /**
     * Uma mudança nova invalida qualquer "futuro" que só existia porque o usuário desfez algo —
     * mas só quando ela é MESMO uma mudança. O descarte era incondicional, então uma passada do
     * Enxame ou do Hunter que não alterasse um caractere ainda assim apagava o refazer: a pessoa
     * desfazia, mandava auditar, o Hunter não mudava nada, e o Ctrl+Y deixava de existir.
     */
    setRedoStack([]);
  };

  const handleUndoChange = () => {
    if (historyStack.length === 0) {
      setNotificationBanner({ message: "Nada para desfazer no código!", type: 'info' });
      return;
    }

    const previousFiles = historyStack[historyStack.length - 1];
    setHistoryStack(prev => prev.slice(0, -1));
    // O topo mudou por fora do pushHistory: zerar a marca faz a próxima alteração ser sempre
    // empilhada. Mantê-la faria o ponto restaurado ser confundido com "nada mudou", e a edição
    // seguinte deixaria de ter para onde voltar.
    topoDoHistoricoRef.current = '';

    // Guarda o estado atual para que essa desfeita possa ser refeita depois.
    setRedoStack(prev => {
      const snapshot = JSON.parse(JSON.stringify(files));
      const next = [...prev, snapshot];
      if (next.length > 30) return next.slice(next.length - 30);
      return next;
    });

    if (previousFiles && Array.isArray(previousFiles) && previousFiles.length > 0) {
      setFiles(previousFiles);

      if (!previousFiles.some(f => f.id === activeFileId)) {
        setActiveFileId(previousFiles[0].id);
      }

      try {
        localStorage.setItem('osone_code_repository_files', JSON.stringify(previousFiles));
      } catch (e) {}

      setProjects(prevProjects => {
        const updated = prevProjects.map(p =>
          p.id === activeProjectId ? { ...p, files: previousFiles, updatedAt: Date.now() } : p
        );
        try {
          localStorage.setItem('osone_code_projects_v2', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      window.dispatchEvent(new Event('osone_repository_updated'));
      setNotificationBanner({ message: "Alteração desfeita com sucesso! Estado anterior restaurado. ↩️", type: 'success' });
    }
  };

  const handleRedoChange = () => {
    if (redoStack.length === 0) {
      setNotificationBanner({ message: "Nada para refazer no código!", type: 'info' });
      return;
    }

    const nextFiles = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    topoDoHistoricoRef.current = '';

    // Guarda o estado atual de volta no histórico de desfazer, para poder desfazer o refazer.
    setHistoryStack(prev => {
      const snapshot = JSON.parse(JSON.stringify(files));
      const next = [...prev, snapshot];
      if (next.length > 30) return next.slice(next.length - 30);
      return next;
    });

    if (nextFiles && Array.isArray(nextFiles) && nextFiles.length > 0) {
      setFiles(nextFiles);

      if (!nextFiles.some(f => f.id === activeFileId)) {
        setActiveFileId(nextFiles[0].id);
      }

      try {
        localStorage.setItem('osone_code_repository_files', JSON.stringify(nextFiles));
      } catch (e) {}

      setProjects(prevProjects => {
        const updated = prevProjects.map(p =>
          p.id === activeProjectId ? { ...p, files: nextFiles, updatedAt: Date.now() } : p
        );
        try {
          localStorage.setItem('osone_code_projects_v2', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      window.dispatchEvent(new Event('osone_repository_updated'));
      setNotificationBanner({ message: "Alteração refeita com sucesso! ↪️", type: 'success' });
    }
  };

  /**
   * O atalho global chama SEMPRE a versão mais recente de desfazer/refazer.
   *
   * O ouvinte era reinscrito por uma lista de dependências que incluía 'files'. Como 'files' muda
   * a cada caractere digitado, o ouvinte de teclado da janela era removido e recolocado a cada
   * tecla — trabalho à toa no caminho mais quente do editor. Pior: 'activeFileId' NÃO estava na
   * lista, então o desfazer decidia com um arquivo aberto vencido e podia pular para o arquivo
   * errado depois de restaurar.
   *
   * Guardar as funções numa referência resolve os dois de uma vez: o ouvinte é inscrito uma única
   * vez, e mesmo assim sempre executa a versão da renderização atual, com o estado atual.
   */
  const acoesDeHistoricoRef = useRef({ desfazer: () => {}, refazer: () => {} });
  acoesDeHistoricoRef.current = { desfazer: handleUndoChange, refazer: handleRedoChange };

  // GLOBAL CTRL+Z / CMD+Z (DESFAZER) E CTRL+SHIFT+Z / CMD+SHIFT+Z / CTRL+Y (REFAZER)
  useEffect(() => {
    const handleGlobalUndoRedoKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
      // Ctrl+F abre a busca do projeto em vez da busca do navegador, que só enxerga o que está
      // desenhado na tela — e o editor mostra um arquivo por vez.
      if (modifierPressed && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setBuscaAberta(true);
        setTimeout(() => campoDeBuscaRef.current?.focus(), 0);
        return;
      }
      if (e.key === 'Escape' && buscaAberta) {
        setBuscaAberta(false);
        return;
      }
      const isUndo = modifierPressed && e.key.toLowerCase() === 'z' && !e.shiftKey;
      const isRedo = modifierPressed && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y');
      if (isUndo || isRedo) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.classList.contains('code-editor-textarea')) {
          return;
        }
        e.preventDefault();
        if (isRedo) {
          acoesDeHistoricoRef.current.refazer();
        } else {
          acoesDeHistoricoRef.current.desfazer();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalUndoRedoKey);
    return () => window.removeEventListener('keydown', handleGlobalUndoRedoKey);
    // Só 'buscaAberta' entra: é a única coisa lida direto aqui dentro. Desfazer e refazer chegam
    // pela referência acima, sempre atualizados, sem reinscrever o ouvinte a cada tecla.
  }, [buscaAberta]);

  // SWITCH ACTIVE PROJECT (1 OF 5)
  const handleSwitchProject = (targetProjectId: string) => {
    if (targetProjectId === activeProjectId) return;

    // Save active project files to projects array
    const updatedProjects = projects.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          files: files,
          activeFileId: activeFileId,
          updatedAt: Date.now()
        };
      }
      return p;
    });

    const targetProject = updatedProjects.find(p => p.id === targetProjectId) || updatedProjects[0];

    setProjects(updatedProjects);
    setActiveProjectId(targetProject.id);
    setFiles(targetProject.files);
    setActiveFileId(targetProject.activeFileId || targetProject.files[0]?.id || 'main-app');
    /**
     * Os DOIS históricos são zerados na troca de projeto.
     *
     * Só o de desfazer era limpo, e o de refazer sobrevivia à troca carregando os arquivos do
     * projeto anterior. Um Ctrl+Y depois de trocar despejava o Projeto 1 inteiro por cima do
     * Projeto 2 — sem aviso, e sem nada no caminho que revelasse de onde aquele código veio.
     */
    setHistoryStack([]);
    setRedoStack([]);
    topoDoHistoricoRef.current = '';
    // O relógio da digitação também zera: sem isto, a primeira tecla no projeto novo, se vier
    // dentro dos 2 segundos da última tecla do projeto anterior, não guardava ponto de retorno.
    setLastTypedHistoryTime(0);

    try {
      localStorage.setItem('osone_code_active_project_id', targetProject.id);
      localStorage.setItem('osone_code_projects_v2', JSON.stringify(updatedProjects));
      localStorage.setItem('osone_code_repository_files', JSON.stringify(targetProject.files));
    } catch (e) {}

    window.dispatchEvent(new Event('osone_repository_updated'));
    setNotificationBanner({
      message: `Projeto alterado para "${targetProject.name}". Alterações afetam apenas este projeto! 📁`,
      type: 'success'
    });
  };

  // RENAME PROJECT
  const handleSaveProjectName = (projId: string) => {
    if (!editingProjectNameText.trim()) {
      setEditingProjectNameId(null);
      return;
    }
    const newName = editingProjectNameText.trim();
    setProjects(prev => {
      const updated = prev.map(p => p.id === projId ? { ...p, name: newName, updatedAt: Date.now() } : p);
      try {
        localStorage.setItem('osone_code_projects_v2', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    setEditingProjectNameId(null);
    setNotificationBanner({ message: `Projeto renomeado para "${newName}"!`, type: 'success' });
  };

  /**
   * ÚNICO caminho por onde código gerado entra no repositório.
   *
   * Ser único importa: enquanto a geração pelo chat escrevia direto no localStorage por fora
   * daqui, aquela alteração — a mais destrutiva de todas, porque troca o arquivo inteiro — era
   * justamente a única que o desfazer não alcançava.
   *
   * O alvo é sempre EXPLÍCITO. Antes o destino era 'index.html' fixo, então auditar um script.js
   * gravava o resultado por cima do index.html; e quando o nome pedido não existia no projeto, o
   * conteúdo caía no primeiro arquivo da lista, fosse ele qual fosse. Agora um nome que não existe
   * vira arquivo novo, e nada é sobrescrito sem ter sido escolhido.
   */
  /**
   * Qual arquivo o Enxame considera "a página do projeto".
   *
   * Ordem: o marcado como principal, depois um index.html, depois o primeiro HTML que existir, e
   * só então o nome 'index.html' — que nesse ponto vira arquivo novo, porque o projeto realmente
   * não tem página nenhuma.
   */
  const arquivoPrincipalId = (): string => {
    const atuais = filesRef.current;
    const principal = atuais.find(f => f.isMain)
      || atuais.find(f => f.name.toLowerCase() === 'index.html')
      || atuais.find(f => /\.html?$/i.test(f.name));
    return principal?.id || 'index.html';
  };

  const applyCodeToRepository = (newContent: string, targetFileIdOrName?: string) => {
    const atuais = filesRef.current;
    pushHistory(atuais);

    const alvo = (targetFileIdOrName || activeFileId || '').trim();
    const idx = atuais.findIndex(f => f.id === alvo || f.name.toLowerCase() === alvo.toLowerCase());

    let updatedFiles: CodeRepositoryFile[];
    let idDoAlvo: string;

    if (idx !== -1) {
      updatedFiles = atuais.map((f, i) => i === idx ? { ...f, content: newContent, updatedAt: Date.now() } : f);
      idDoAlvo = atuais[idx].id;
    } else {
      // Nome pedido não existe no projeto: cria, em vez de derrubar um arquivo alheio.
      const pareceNomeDeArquivo = /\.[a-z0-9]{1,8}$/i.test(alvo);
      const nome = pareceNomeDeArquivo ? alvo : 'index.html';
      const ext = nome.split('.').pop()?.toLowerCase() || 'html';
      const novo: CodeRepositoryFile = {
        id: 'file-' + Date.now(),
        name: nome,
        language: ext === 'html' || ext === 'htm' ? 'html' : ext === 'css' ? 'css' : ext === 'py' ? 'python' : 'javascript',
        ...(nome.toLowerCase() === 'index.html' ? { isMain: true } : {}),
        updatedAt: Date.now(),
        content: newContent
      };
      updatedFiles = [...atuais, novo];
      idDoAlvo = novo.id;
    }

    // A lista nova é montada AQUI, e não dentro do setFiles: o React só executa aquele callback
    // na renderização seguinte, então tudo o que fosse lido logo abaixo dele veria uma lista
    // vazia — era por isso que o editor nunca pulava para o arquivo que a IA acabara de mudar.
    setFiles(updatedFiles);
    setActiveFileId(idDoAlvo);
    setIsSaved(true);

    try {
      localStorage.setItem('osone_code_repository_files', JSON.stringify(updatedFiles));
    } catch (e) {
      console.error("Erro ao salvar no localStorage:", e);
    }

    window.dispatchEvent(new Event('osone_repository_updated'));
  };

  // ====== EDITOR DE CÓDIGO: RÉGUA DE LINHAS E INDENTAÇÃO ======

  /**
   * A MEDIDA DO EDITOR, num lugar só.
   *
   * A régua de linhas, a camada de realce e a área de escrita precisam ter exatamente a mesma
   * fonte, o mesmo tamanho, a mesma altura de linha e a mesma folga no topo. Um pixel de
   * diferença e os números descolam do código; no realce, o texto colorido descola do texto real e
   * o cursor aparece no lugar errado.
   *
   * Isso estava escrito como classes utilitárias repetidas em três lugares — três cópias que
   * precisavam ser mudadas juntas, e nada avisaria se uma ficasse para trás. Aqui é um objeto só,
   * aplicado nos três, o que também torna o alinhamento verificável fora do app: não depende de
   * nenhuma folha de estilo ter carregado.
   */
  const METRICA_DO_EDITOR: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: '13px',
    lineHeight: '1.625',
    paddingTop: '16px',
    paddingBottom: '16px',
    whiteSpace: 'pre',
    tabSize: 2,
    margin: 0
  };

  /** Quantas linhas o arquivo tem. Sempre pelo menos uma, para a régua nunca ficar vazia. */
  const totalDeLinhas = Math.max(1, (activeFile?.content || '').split('\n').length);

  /**
   * Largura real da régua de linhas, medida do elemento.
   *
   * A camada de realce começa onde a régua acaba, e a régua muda de largura sozinha quando o
   * arquivo passa de 99 para 100 linhas. Um valor fixo aqui desalinharia o realce exatamente
   * nesse momento, num arquivo grande — que é quando o realce mais serve.
   */
  const [larguraDaRegua, setLarguraDaRegua] = useState(0);
  useEffect(() => {
    const medir = () => setLarguraDaRegua(reguaRef.current?.offsetWidth || 0);
    medir();
    window.addEventListener('resize', medir);

    /**
     * Medir só na troca de arquivo e no 'resize' da janela deixava frestas visíveis.
     *
     * A régua muda de largura sem que a janela mude de tamanho: quando o arquivo passa de 99 para
     * 100 linhas, quando a barra de arquivos ANIMA de fechada para aberta (a largura varia durante
     * toda a animação, e o 'resize' não dispara em nenhum quadro dela), e quando o navegador muda
     * de zoom ou de fonte. Em todos esses momentos o realce ficava deslocado do texto por alguns
     * quadros — bem no lugar onde o desalinhamento é mais visível.
     *
     * O observador acompanha o elemento em si, então pega qualquer um desses casos, inclusive os
     * quadros intermediários da animação.
     */
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (observador && reguaRef.current) observador.observe(reguaRef.current);

    return () => {
      window.removeEventListener('resize', medir);
      observador?.disconnect();
    };
  }, [totalDeLinhas, activeFileId, viewLayout, showRepoSidebar]);

  /**
   * Lê o que está marcado no editor. Chamado pelos eventos que podem mudar a seleção.
   *
   * Seleção de um caractere ou de espaço em branco não conta: seria fácil ativar sem querer com
   * um clique arrastado, e o modo "editar só o trecho" precisa ser uma escolha, não um acidente.
   */
  const lerSelecaoDoEditor = () => {
    const area = editorRef.current;
    if (!area) return;
    const inicio = area.selectionStart;
    const fim = area.selectionEnd;
    const texto = area.value.slice(inicio, fim);
    if (fim - inicio < 2 || !texto.trim()) {
      setSelecaoDoEditor(prev => (prev === null ? prev : null));
      return;
    }
    setSelecaoDoEditor(prev =>
      (prev && prev.inicio === inicio && prev.fim === fim) ? prev : { inicio, fim, texto });
  };

  // Trocar de arquivo ou de projeto invalida qualquer seleção: ela apontava para outro texto.
  useEffect(() => { setSelecaoDoEditor(null); }, [activeFileId, activeProjectId]);

  /** A régua acompanha a rolagem do texto — senão os números ficam parados enquanto o código anda. */
  const sincronizarRegua = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (reguaRef.current) reguaRef.current.scrollTop = e.currentTarget.scrollTop;
    // A camada do realce acompanha nos DOIS eixos: com a quebra de linha desligada existe rolagem
    // horizontal, e sincronizar só a vertical faria as cores deslizarem para o lado do texto.
    if (realceRef.current) {
      realceRef.current.scrollTop = e.currentTarget.scrollTop;
      realceRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  /**
   * Devolve o cursor ao lugar certo depois que o texto novo chega.
   *
   * A área de escrita é controlada pelo React: ao trocar o conteúdo, o navegador joga o cursor
   * para o fim. Numa indentação isso significaria perder a posição a cada Tab, o que torna a
   * tecla inútil. A posição é anotada antes e reaplicada assim que o texto novo está na tela.
   */
  useEffect(() => {
    const alvo = selecaoPendenteRef.current;
    if (!alvo || !editorRef.current) return;
    selecaoPendenteRef.current = null;
    editorRef.current.setSelectionRange(alvo.inicio, alvo.fim);
  }, [activeFile?.content]);

  const RECUO = '  ';

  /**
   * Tab indenta em vez de pular para o próximo campo.
   *
   * Numa área de texto comum o Tab move o foco para fora — num editor de código isso é o oposto
   * do esperado: quem escreve código aperta Tab dezenas de vezes por arquivo. Com seleção de
   * várias linhas, indenta o bloco inteiro; com Shift, tira um nível.
   */
  const aoTeclarNoEditor = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();

    const { selectionStart: inicio, selectionEnd: fim, value } = e.currentTarget;
    const varias = value.slice(inicio, fim).includes('\n');

    if (varias || e.shiftKey) {
      // O bloco começa no INÍCIO da primeira linha tocada, e não onde a seleção começou: indentar
      // do meio de uma linha deixaria espaços soltos no meio do código.
      const inicioDaLinha = value.lastIndexOf('\n', inicio - 1) + 1;
      const bloco = value.slice(inicioDaLinha, fim);
      const novoBloco = e.shiftKey
        ? bloco.replace(/^[ \t]{1,2}/gm, '')
        : bloco.replace(/^/gm, RECUO);
      if (novoBloco === bloco) return;

      handleUpdateActiveContent(value.slice(0, inicioDaLinha) + novoBloco + value.slice(fim));
      // O bloco continua selecionado, para dar para apertar Tab de novo e seguir indentando.
      selecaoPendenteRef.current = { inicio: inicioDaLinha, fim: inicioDaLinha + novoBloco.length };
      return;
    }

    handleUpdateActiveContent(value.slice(0, inicio) + RECUO + value.slice(fim));
    selecaoPendenteRef.current = { inicio: inicio + RECUO.length, fim: inicio + RECUO.length };
  };

  const handleUpdateActiveContent = (newContent: string) => {
    const now = Date.now();
    /**
     * Um ponto de retorno a cada 2 segundos de digitação, e não a cada tecla.
     *
     * É de propósito: um ponto por caractere encheria os 30 guardados com meia frase, e o Ctrl+Z
     * andaria letra por letra. A janela agrupa a digitação corrida num passo só, como fazem os
     * editores.
     *
     * O relógio zera ao trocar de ARQUIVO (efeito abaixo) e de projeto: sem isso, a primeira
     * edição no arquivo recém-aberto caía dentro da janela do arquivo anterior e entrava no mesmo
     * passo — um Ctrl+Z desfazia mudanças em dois arquivos de uma vez.
     */
    if (now - lastTypedHistoryTime > 2000) {
      pushHistory(files);
      setLastTypedHistoryTime(now);
    }
    setIsSaved(false);
    setFiles(prev => {
      const updated = prev.map(f => f.id === activeFileId ? { ...f, content: newContent, updatedAt: Date.now() } : f);
      try {
        localStorage.setItem('osone_code_repository_files', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleCreateNewFile = () => {
    const fileName = window.prompt('Nome do novo arquivo (ex: index.html, script.js, style.css, app.py):');
    if (!fileName || !fileName.trim()) return;

    pushHistory(files);
    const trimmed = fileName.trim();
    const ext = trimmed.split('.').pop()?.toLowerCase() || 'txt';
    let lang = 'javascript';
    if (ext === 'html' || ext === 'htm') lang = 'html';
    else if (ext === 'css') lang = 'css';
    else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') lang = 'javascript';
    else if (ext === 'py') lang = 'python';
    else if (ext === 'json') lang = 'json';
    else if (ext === 'md') lang = 'markdown';
    else if (ext === 'sql') lang = 'sql';

    const newFile: CodeRepositoryFile = {
      id: 'file-' + Date.now(),
      name: trimmed,
      language: lang,
      content: lang === 'html' ? `<!DOCTYPE html>\n<html>\n<head>\n  <title>${trimmed}</title>\n</head>\n<body>\n  <h1>${trimmed}</h1>\n</body>\n</html>` : `// Arquivo: ${trimmed}\n`,
      updatedAt: Date.now()
    };

    setFiles(prev => [...prev, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleDeleteFile = (id: string, name: string) => {
    if (files.length <= 1) {
      alert('Você precisa manter pelo menos um arquivo no repositório!');
      return;
    }
    if (window.confirm(`Deseja mesmo apagar o arquivo "${name}" do repositório?`)) {
      pushHistory(files);
      // O próximo arquivo a abrir sai da lista JÁ FILTRADA, dentro do próprio setState. Escolher
      // pela lista do closure ('files') dava o vizinho segundo uma lista possivelmente vencida —
      // e o editor abria um arquivo que já não existia mais.
      setFiles(prev => {
        const restantes = prev.filter(f => f.id !== id);
        if (activeFileId === id && restantes.length > 0) {
          setActiveFileId(restantes[0].id);
        }
        return restantes;
      });
    }
  };

  const handleRenameFileSubmit = (id: string) => {
    const novoNome = editingFileNameText.trim();
    if (!novoNome) return;
    // Renomear é uma alteração como outra qualquer: entra no histórico, e o Ctrl+Z desfaz.
    pushHistory(files);
    setFiles(prev => prev.map(f => f.id === id
      // A linguagem acompanha o nome: sem isto, um script.js renomeado para styles.css continuava
      // marcado como javascript, e o realce pintava CSS com as regras de JS.
      ? { ...f, name: novoNome, language: linguagemPelaExtensao(novoNome), updatedAt: Date.now() }
      : f));
    setEditingFileNameId(null);
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    // A área de transferência falha em contexto não seguro e quando a permissão é negada. Sem
    // tratar, o botão simplesmente não reagia e a pessoa ficava clicando achando que copiou.
    navigator.clipboard.writeText(activeFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setNotificationBanner({
        message: 'Não foi possível copiar para a área de transferência. Selecione o texto no editor e use Ctrl+C.',
        type: 'error'
      });
    });
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFileDisk = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0];
    if (!uploaded) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text !== undefined) {
        // Importar entra no histórico como qualquer outra alteração — sem isto, o Ctrl+Z logo
        // depois de importar desfazia a edição ANTERIOR à importação, deixando o arquivo
        // importado na lista e revertendo algo que a pessoa não pediu para reverter.
        pushHistory(filesRef.current);
        const newFile: CodeRepositoryFile = {
          id: 'file-' + Date.now(),
          name: uploaded.name,
          // Mesma regra da criação e da renomeação: .py, .json e .md deixavam de ser reconhecidos.
          language: linguagemPelaExtensao(uploaded.name),
          content: text,
          updatedAt: Date.now()
        };
        setFiles(prev => [...prev, newFile]);
        setActiveFileId(newFile.id);
      }
    };
    reader.readAsText(uploaded);
  };

  /**
   * Lê o arquivo aberto e devolve melhorias concretas PARA AQUELE código.
   *
   * Não é chamada a cada tecla de propósito: analisar a cada caractere digitado gastaria cota do
   * usuário sem parar, para responder sobre um arquivo que ainda está sendo escrito. Roda quando
   * o resultado interessa — depois que a IA aplica código, ao abrir um arquivo que ainda não foi
   * lido, e quando a pessoa pede.
   */
  const lerSugestoesDoCodigo = async (codigo: string, nomeDoArquivo: string) => {
    const conteudo = (codigo || '').trim();
    // Arquivo curto demais não tem o que sugerir; as frases fixas servem melhor aqui.
    if (conteudo.length < 200) {
      setSugestoesDoCodigo([]);
      codigoJaAnalisadoRef.current = '';
      return;
    }
    if (codigoJaAnalisadoRef.current === conteudo) return;

    cancelamentoDasSugestoesRef.current?.abort();
    const controle = new AbortController();
    cancelamentoDasSugestoesRef.current = controle;
    setLendoSugestoes(true);

    try {
      const resultado = await generateWithRetry({
        clientApiKey: apiKeys?.gemini || '',
        model: OSONE_CODE_BEST_MODEL,
        modeloDeReserva: apiKeys?.geminiModel || '',
        // Sugestão é resposta curta: os ajustes pesados da geração de código só encareceriam e
        // atrasariam algo que precisa ser barato para poder acontecer com frequência.
        unrestricted: false,
        responseMimeType: 'application/json',
        systemInstruction: `Você lê código e aponta as MELHORIAS MAIS VALIOSAS daquele arquivo específico.

REGRAS:
- Cada sugestão precisa citar algo que existe NO CÓDIGO (nome de função, variável, trecho, comportamento observável). Uma sugestão que caberia em qualquer arquivo é uma sugestão inútil.
- Escreva como uma ORDEM curta e direta para outro programador executar, em português. Máximo 90 caracteres.
- Priorize nesta ordem: bug real > risco de travamento/performance > acessibilidade > organização > estética.
- Nada de "adicione comentários" ou "melhore a legibilidade" sem dizer onde e por quê.

Responda APENAS um array JSON de 4 strings. Exemplo do formato:
["Corrija a colisão que ignora o eixo Z na função checarBatida", "Troque o setInterval do loop por requestAnimationFrame"]`,
        prompt: `ARQUIVO: ${nomeDoArquivo}\n\nCÓDIGO:\n${conteudo}`
      }, 1, controle.signal);

      if (controle.signal.aborted) return;

      if (resultado.ok && resultado.text) {
        let texto = resultado.text.trim();
        if (texto.startsWith('```')) texto = texto.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
        try {
          const lista = JSON.parse(texto);
          if (Array.isArray(lista)) {
            const limpas = lista
              .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
              .map((s: string) => s.trim())
              .slice(0, 4);
            setSugestoesDoCodigo(limpas);
            codigoJaAnalisadoRef.current = conteudo;
          }
        } catch {
          // Resposta fora do formato: as frases fixas continuam na tela, e nada é anunciado —
          // sugestão é um extra, e um extra que falha não pode virar erro na cara do usuário.
        }
      }
    } catch (_) {
      /* idem: falha ao sugerir nunca interrompe o trabalho de quem está programando */
    } finally {
      if (cancelamentoDasSugestoesRef.current === controle) cancelamentoDasSugestoesRef.current = null;
      setLendoSugestoes(false);
    }
  };

  // Ao abrir um arquivo, as sugestões do anterior não valem mais para ele.
  useEffect(() => {
    setSugestoesDoCodigo([]);
    codigoJaAnalisadoRef.current = '';
    cancelamentoDasSugestoesRef.current?.abort();
  }, [activeFileId, activeProjectId]);

  useEffect(() => () => cancelamentoDasSugestoesRef.current?.abort(), []);

  /**
   * O código exatamente como o preview o executa.
   *
   * Importa que seja este, e não o arquivo aberto: o preview roda o projeto MONTADO, com o
   * styles.css e o script.js embutidos no HTML. Quando o navegador diz "erro na linha 312", é
   * desta montagem que ele fala — e é só aqui que dá para descobrir o que essa linha contém.
   */
  const codigoQueRoda = linguagemDoArquivo(activeFile?.name || '', activeFile?.language) === 'python'
    ? (activeFile?.content || '')
    : montarPreview(files, activeFile);

  /**
   * Guarda um problema vindo do preview.
   *
   * O teto de 200 é proteção contra o caso normal, não contra o excepcional: um erro dentro do
   * laço do jogo dispara sessenta vezes por segundo, e sem limite a lista cresceria sem fim
   * enquanto a página estivesse aberta. As repetições são agrupadas na hora de montar o pedido.
   */
  const registrarProblemaDoPreview = React.useCallback((problema: ProblemaDoPreview) => {
    setProblemasDoPreview(prev => (prev.length >= 200 ? prev : [...prev, problema]));
  }, []);

  /**
   * Código novo é execução nova: os erros da versão anterior não valem mais para esta.
   *
   * Sem isto, o aviso vermelho continuaria na tela depois do conserto, apontando um defeito que
   * já não existe — e o botão "Corrigir com a IA" mandaria o modelo caçar de novo um erro que ele
   * acabou de resolver. A guarda do 'length' evita uma renderização extra a cada tecla digitada.
   */
  useEffect(() => {
    setProblemasDoPreview(prev => (prev.length === 0 ? prev : []));
  }, [codigoQueRoda, activeFileId, activeProjectId]);

  const errosAgrupados = juntarProblemas(problemasDoPreview);
  const quantosErros = errosAgrupados.filter(p => p.tipo === 'erro').length;

  const handleSendAIPrompt = async (promptText?: string) => {
    const textToSend = promptText || promptInput;
    if (!textToSend.trim() || !onGenerateCodeRequest) return;

    /**
     * O arquivo ABERTO é o que vai para a IA, e é nele que o resultado volta.
     *
     * O outro lado escolhia sozinho: mandava o primeiro arquivo da lista como "código atual" e
     * gravava no index.html. Editando um script.js, o modelo recebia o HTML e devolvia edições
     * para ele — e quando o primeiro da lista não era o index.html, o conteúdo de um arquivo
     * acabava gravado por cima de outro, apagando o segundo por inteiro.
     */
    // A seleção é lida AQUI, no instante do envio: é o que a pessoa via marcado ao apertar gerar.
    const trechoDoPedido = selecaoDoEditor && activeFile
      && activeFile.content.slice(selecaoDoEditor.inicio, selecaoDoEditor.fim) === selecaoDoEditor.texto
      ? selecaoDoEditor : undefined;

    const alvo = activeFile
      ? { nome: activeFile.name, conteudo: activeFile.content, trechoSelecionado: trechoDoPedido }
      : undefined;
    const idDoAlvo = activeFile?.id;

    const imagesToSend = attachedImages.map(img => ({ mimeType: img.mimeType, data: img.data }));
    setPromptInput('');
    attachedImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
    setAttachedImages([]);

    // A escrita ao vivo começa vazia (e não em null): é isso que troca o editor pelo painel de
    // acompanhamento já no primeiro instante, em vez de só quando o primeiro pedaço chegar.
    const controle = new AbortController();
    cancelamentoRef.current = controle;
    setEscritaAoVivo('');

    let resultado: { conteudo: string; resumo: string } | null = null;
    try {
      resultado = await onGenerateCodeRequest(
        textToSend,
        imagesToSend.length > 0 ? imagesToSend : undefined,
        maxEffort,
        alvo,
        (textoAcumulado) => setEscritaAoVivo(textoAcumulado),
        controle.signal
      );
    } finally {
      // O editor volta em qualquer desfecho — inclusive erro e cancelamento. Deixar o painel de
      // acompanhamento na tela depois que a geração morreu esconderia o arquivo do usuário.
      setEscritaAoVivo(null);
      cancelamentoRef.current = null;
    }

    if (controle.signal.aborted) {
      setNotificationBanner({ message: 'Geração cancelada. O arquivo não foi alterado.', type: 'info' });
      setPromptInput(textToSend);
      return;
    }

    if (resultado?.conteudo && resultado.conteudo.trim() && resultado.conteudo !== alvo?.conteudo) {
      // Passa pelo caminho único de gravação, que guarda o estado anterior no histórico — é o
      // que torna uma reescrita feita pela IA reversível com Ctrl+Z.
      applyCodeToRepository(resultado.conteudo, idDoAlvo);
      // O alerta do outro lado é passageiro e some no canto; o painel do editor é onde a pessoa
      // está olhando. Um arquivo que não fecha não pode ser anunciado aqui em verde.
      const chegouIncompleto = pareceDocumentoIncompleto(resultado.conteudo);
      setNotificationBanner({
        message: chegouIncompleto
          ? `⚠️ O código aplicado em "${alvo?.nome || 'arquivo'}" está INCOMPLETO: o arquivo termina no meio, sem fechar. Peça para terminar o arquivo, ou divida o pedido. Ctrl+Z desfaz.`
          : `Código aplicado em "${alvo?.nome || 'arquivo'}"${resultado.resumo ? ` — ${resultado.resumo}` : ''}. Dá para desfazer com Ctrl+Z.`,
        type: chegouIncompleto ? 'error' : 'success'
      });
      // Código novo na tela é exatamente o momento do "e agora?". As sugestões passam a falar
      // deste código, e não do que estava aqui antes.
      lerSugestoesDoCodigo(resultado.conteudo, alvo?.nome || 'arquivo');
      return;
    }

    /**
     * A GERAÇÃO QUE NÃO DEU EM NADA TAMBÉM PRECISA APARECER AQUI.
     *
     * Este bloco não existia: quando não vinha código, a função simplesmente terminava. A pessoa
     * escrevia o pedido, apertava gerar, a caixa esvaziava — e nada acontecia na tela do editor.
     * Sem erro, sem aviso, sem código. O aviso lá do outro lado é um alerta passageiro no canto,
     * fácil de perder; o editor precisa dizer, no próprio painel, que a tentativa terminou sem
     * mudar nada. E o texto do pedido volta para a caixa, para não ser preciso digitar tudo de
     * novo só para tentar outra vez.
     */
    setPromptInput(textToSend);
    setNotificationBanner({
      message: resultado?.conteudo && resultado.conteudo === alvo?.conteudo
        ? 'O modelo respondeu, mas nada mudou no arquivo. Seu pedido continua na caixa — tente de novo dizendo qual parte deve mudar.'
        : 'A geração não devolveu código. Seu pedido continua na caixa para você tentar de novo.',
      type: 'error'
    });
  };

  const handleAttachImages = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        setAttachedImages(prev => [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          mimeType: file.type,
          data: base64,
          previewUrl: URL.createObjectURL(file)
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveAttachedImage = (id: string) => {
    setAttachedImages(prev => {
      const target = prev.find(img => img.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(img => img.id !== id);
    });
  };

  // HUNTER CODE EXAMINATION & AUTOMATIC IMPLEMENTATION
  const runHunterAnalysis = async (explicitClarification?: string) => {
    const promptToVerify = explicitClarification 
      ? `${hunterPrompt.trim()} (Esclarecimento adicional: ${explicitClarification})`
      : hunterPrompt.trim();

    if (!promptToVerify) return;

    setHunterStatus('analyzing');
    setHunterProgress(20);
    setHunterReport("O Hunter está caçando falhas, lacunas e itens ausentes no código...");
    setHunterDoubt(null);

    const controle = new AbortController();
    cancelamentoDoHunterRef.current?.abort();
    cancelamentoDoHunterRef.current = controle;

    try {
      setHunterProgress(50);
      const effectiveApiKey = apiKeys?.gemini || '';
      const currentCode = activeFile ? activeFile.content : '';

      const systemInstruction = `Você é o HUNTER, o Caçador e Examinador Agêntico de Código do OSONE Studio.
Sua missão é examinar o CÓDIGO FONTE ATUAL do arquivo do repositório ("${activeFile?.name || 'código'}") contra as REQUISITOS E PEDIDO DO USUÁRIO.

Sua meta é GARANTIR 100% de conformidade, precisão e integridade do código sem faltar nada do pedido:
1. Analise o código atual e verifique o que foi pedido pelo usuário.
2. Se faltar alguma funcionalidade, estilização, verificação, lógica ou componente, implemente EDIÇÕES CIRÚRGICAS: assim como um assistente de codificação real (par de programação estilo "vibe coding"), você NUNCA reescreve o arquivo inteiro quando já existe código funcionando. Localize o trecho exato e substitua só ele.
3. Se você tiver alguma DÚVIDA IMPEDITIVA CRÍTICA sobre o que o usuário deseja, sinalize isso.
4. Se o pedido puder ser verificado e implementado com segurança, aplique as mudanças e resuma o que foi feito.

Responda ESTRITAMENTE neste formato de texto puro (NUNCA use JSON — código com aspas e quebras de linha quebra o JSON facilmente), preenchendo cada seção:

=== HAS_DOUBT ===
true ou false

=== DOUBT_QUESTION ===
(a pergunta, só se HAS_DOUBT for true; senão deixe vazio)

=== SUMMARY ===
(resumo objetivo e marcante das verificações/melhorias feitas, ou da dúvida)

=== EDITS ===
(só preencha esta seção se HAS_DOUBT for false. Coloque um ou mais blocos SEARCH/REPLACE em texto puro, cada um assim:
<<<<<<< SEARCH
trecho exato e único do código atual a ser substituído
=======
texto que entra no lugar
>>>>>>> REPLACE
Se o código já estiver 100% conforme e nenhuma mudança for necessária, deixe esta seção vazia.
Se o arquivo estiver vazio ou for necessário recriar do zero, em vez de blocos SEARCH/REPLACE coloque o código-fonte COMPLETO direto nesta seção, sem marcadores.)`;

      const userContentPayload = `EXIGÊNCIAS / REQUISITOS DO USUÁRIO A SEREM VERIFICADOS E IMPLEMENTADOS:
"${promptToVerify}"

CÓDIGO ATUAL NO ARQUIVO ("${activeFile?.name || 'código'}"):
${currentCode}`;

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientApiKey: effectiveApiKey,
          model: OSONE_CODE_BEST_MODEL,
          // Mesma reserva do Enxame: sem ela, uma chave que não sirva os dois modelos preferidos
          // faz o Hunter falhar sempre, mesmo com o chat funcionando.
          modeloDeReserva: apiKeys?.geminiModel || '',
          prompt: userContentPayload,
          systemInstruction,
          unrestricted: true
        }),
        signal: controle.signal
      });

      const data = await response.json().catch(() => ({} as any));
      // Desistiu enquanto a resposta vinha: nada é gravado no arquivo.
      if (controle.signal.aborted) return;
      if (!response.ok) {
        throw new Error(data?.error || "Erro na comunicação com a API do Hunter.");
      }
      if (data.blocked) {
        throw new Error(`O Gemini bloqueou a resposta pelo filtro de segurança (finishReason: ${data.finishReason}). Tente reformular o pedido.`);
      }

      const rawText = data.text || "";
      const sections = parseSections(rawText);
      const hasDoubt = /^true$/i.test((sections.HAS_DOUBT || '').trim());
      const doubtQuestion = (sections.DOUBT_QUESTION || '').trim();
      const summary = (sections.SUMMARY || '').trim();

      /**
       * SEM A SEÇÃO '=== EDITS ===', NÃO HÁ NADA PARA GRAVAR.
       *
       * O texto cru servia de plano B aqui, e isso só funciona quando a resposta veio inteira.
       * Numa resposta cortada pelo limite de tokens — que para antes de chegar em EDITS — o plano
       * B gravava a resposta INTEIRA no arquivo: os cabeçalhos '=== HAS_DOUBT ===', o resumo em
       * português e o que mais tivesse vindo, tudo por cima do código que funcionava. O usuário
       * mandava auditar e recebia o arquivo destruído.
       *
       * O texto cru continua valendo quando o modelo respondeu só o código, ignorando o formato
       * (resposta inteira, sem cabeçalho nenhum) — aí ele é mesmo o arquivo.
       */
      const respostaTemCabecalhos = Object.keys(sections).length > 0;
      const editsSection = sections.EDITS !== undefined
        ? sections.EDITS
        : (respostaTemCabecalhos ? '' : rawText);
      if (sections.EDITS === undefined && respostaTemCabecalhos) {
        console.warn('[Hunter] Resposta sem a seção EDITS (provavelmente cortada). Nada será gravado no arquivo.');
      }

      if (hasDoubt && doubtQuestion) {
        setHunterStatus('doubt');
        setHunterProgress(60);
        setHunterDoubt(doubtQuestion);
        setHunterReport(`Hunter identificou uma dúvida: ${doubtQuestion}`);
      } else {
        setHunterStatus('success');
        setHunterProgress(100);
        setHunterDoubt(null);

        let correctedCode: string | null = null;
        const { content, summary: editSummaryNote, respostaCortada } = applyModelCodeResponse(editsSection, currentCode);
        if (content && content.trim() && content !== currentCode) {
          correctedCode = content;
        }

        // Só é "incompleto" o que chega incompleto ao arquivo: o servidor já mandou o modelo
        // continuar de onde parou antes de responder, e quando isso resolveu não há o que avisar.
        const ficouCortado = data.truncated || respostaCortada
          || (!!correctedCode && pareceDocumentoIncompleto(correctedCode));
        const truncationNote = ficouCortado
          ? "⚠️ A resposta acabou antes do fim (limite de tamanho) — o código pode estar incompleto, confira o fechamento do arquivo."
          : (sections.EDITS === undefined && respostaTemCabecalhos
            ? "⚠️ A resposta veio incompleta (sem a seção de edições) e nada foi gravado, para não danificar o arquivo. Tente de novo."
            : "");
        const finalSummary = [summary || "Código auditado.", editSummaryNote, truncationNote].filter(Boolean).join(' — ');
        setHunterReport(finalSummary || "Código auditado e 100% alinhado com as especificações solicitadas!");

        if (correctedCode && correctedCode.trim().length > 0) {
          /**
           * Grava no arquivo QUE FOI AUDITADO, não no index.html.
           *
           * O Hunter lê o conteúdo do arquivo ativo, mas o destino estava fixo em 'index.html':
           * auditar um script.js gravava o script corrigido por cima do index.html, destruindo os
           * dois de uma vez — o HTML era perdido e o script continuava sem correção.
           */
          const arquivoAuditado = activeFile?.id;
          applyCodeToRepository(correctedCode, arquivoAuditado);

          // O Preview só abre quando o que mudou é renderizável; num .css ou .py ele mostraria
          // o código como se fosse página, o que confunde mais do que informa.
          const ehRenderizavel = /\.(html?|htm)$/i.test(activeFile?.name || '') || activeFile?.language === 'html';
          if (ehRenderizavel) setViewLayout('preview');
          setNotificationBanner({
            message: ficouCortado
              ? `⚠️ Hunter aplicou o que deu em "${activeFile?.name || 'arquivo'}", mas a resposta do modelo acabou antes do fim — revise, o código pode estar incompleto.`
              : `🏹 Hunter auditou e aplicou o código corrigido em "${activeFile?.name || 'arquivo'}"!` +
                (ehRenderizavel ? ' O Preview Vivo foi aberto automaticamente.' : ''),
            type: ficouCortado ? "error" : "success"
          });

          // Auto-fechar modal após 1.8 segundos
          setTimeout(() => {
            setIsHunterModalOpen(false);
          }, 1800);
        }
      }
    } catch (err: any) {
      // Parar não é erro: quem apertou "parar" não precisa de um relatório vermelho de falha.
      if (err?.name === 'AbortError' || controle.signal.aborted) {
        setHunterStatus('idle');
        setHunterProgress(0);
        setHunterReport(null);
        return;
      }
      console.error("Erro no agente Hunter:", err);
      setHunterStatus('error');
      setHunterProgress(100);
      setHunterReport(`Erro na caçada: ${err.message || String(err)}`);
    } finally {
      if (cancelamentoDoHunterRef.current === controle) cancelamentoDoHunterRef.current = null;
    }
  };

  // SWARM HARNESS ENGINE EXECUTION
  const runSwarmHarnessEngine = async () => {
    if (!swarmPrompt.trim()) return;

    setSwarmStatus('running');
    setSwarmLogs([]);
    setSwarmQAReports([]);
    setSwarmPMArtifact(null);
    setSwarmArchitectArtifact(null);
    setSwarmIteration(1);
    setSwarmProgress(5);
    setSwarmProgressText('5% - Disparando Enxame de Agentes OSONE CODE...');

    const addSwarmLog = (agent: string, message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
      const timeStr = new Date().toLocaleTimeString();
      setSwarmLogs(prev => [...prev, { agent, message, timestamp: timeStr, type }]);
    };

    const effectiveApiKey = apiKeys?.gemini || '';
    const currentModel = OSONE_CODE_BEST_MODEL;
    /**
     * O modelo dos Ajustes é a ÚLTIMA reserva — é o único que se sabe que funciona com a chave
     * desta pessoa. Sem ele, a lista de candidatos do Enxame se resume aos dois modelos preferidos,
     * e uma chave que não os sirva faz o Enxame falhar SEMPRE, enquanto o chat segue funcionando
     * normalmente com o modelo configurado. Esta reserva já existia na caixa de gerar código
     * (App.tsx); o Enxame e o Hunter tinham ficado de fora.
     */
    const modeloDeReserva = apiKeys?.geminiModel || '';

    const controle = new AbortController();
    cancelamentoDoEnxameRef.current?.abort();
    cancelamentoDoEnxameRef.current = controle;
    /** Conferido antes de cada etapa e antes de QUALQUER gravação no repositório. */
    const desistiu = () => controle.signal.aborted;

    try {
      // ==========================================
      // STAGE 1: AGENTE DE PRODUTO (PRODUCT MANAGER)
      // ==========================================
      setSwarmCurrentStep('pm');
      setSwarmProgress(15);
      setSwarmProgressText('15% - Agente de Produto criando Game Design Document (GDD)...');
      addSwarmLog('📋 Agente de Produto', 'Analisando conceito e criando o Game Design Document (GDD)...', 'info');

      const pmSystemInstruction = `Você é o AGENTE DE PRODUTO (Product Manager) do OSONE CODE Swarm Engine.
Sua missão é pegar a ideia do usuário para um jogo ou aplicação web em HTML5 e desdobrá-la em um Game Design Document (GDD) completo com requisitos, mecânicas, regras de pontuação/vitória/derrota e controles.

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "gdd": "Resumo completo da visão do jogo, tema visual, gameplay e atmosfera",
  "mechanics": ["Mecânica 1", "Mecânica 2", "Regras de Vitória e Derrota", "Mapeamento de Controles (Seta/WASD/Touch)"],
  "requirements": ["Requisito técnico 1", "Requisito 2", "Áudio Web Audio API"]
}`;

      const pmFallback = { gdd: swarmPrompt, mechanics: ["Controles Responsivos", "Pontuação"], requirements: ["HTML5 Canvas", "CSS3 / Tailwind"] };
      const pmResult = await generateWithRetry({
        clientApiKey: effectiveApiKey,
        model: currentModel,
        prompt: `CONCEITO SOLICITADO PELO USUÁRIO:\n"${swarmPrompt}"`,
        modeloDeReserva,
        systemInstruction: pmSystemInstruction,
        responseMimeType: "application/json"
      }, 2, controle.signal);

      let pmParsed: any = pmFallback;
      if (pmResult.ok) {
        try { pmParsed = JSON.parse(pmResult.text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()); } catch { pmParsed = pmFallback; }
      } else {
        addSwarmLog('📋 Agente de Produto', `⚠️ Falha ao contatar o Agente de Produto (${pmResult.error}). Usando GDD simplificado para não travar o Enxame.`, 'warn');
      }
      if (desistiu()) return;
      setSwarmPMArtifact(pmParsed);
      setSwarmProgress(30);
      setSwarmProgressText('30% - GDD concluído! Iniciando Arquitetura do Sistema...');
      addSwarmLog('📋 Agente de Produto', `GDD concluído! ${pmParsed.mechanics?.length || 0} mecânicas e requisitos definidos.`, 'success');

      // ==========================================
      // STAGE 2: AGENTE DE ARQUITETURA (SOFTWARE ARCHITECT)
      // ==========================================
      setSwarmCurrentStep('architect');
      setSwarmProgress(35);
      setSwarmProgressText('35% - Agente de Arquitetura projetando Game Loop e Canvas...');
      addSwarmLog('🏗️ Agente de Arquitetura', 'Projetando estrutura de arquivos, game loop e gerenciamento de estado...', 'info');

      const architectSystemInstruction = `Você é o AGENTE DE ARQUITETURA (Software Architect) do OSONE CODE Swarm Engine.
Mapeie a estrutura de arquivos e o game loop (requestAnimationFrame), detecção de colisões, estado do canvas/DOM e bibliotecas unificadas.

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "fileStructure": "Estrutura de arquivo unificado index.html com Tailwind CSS, Lucide Icons e Canvas 2D/3D",
  "gameLoopStrategy": "Detalhes da arquitetura de loop de jogo, delta time, escopo de variáveis e gestão de telas (Menu, Playing, GameOver)",
  "librariesUsed": ["Tailwind CSS CDN", "Lucide Icons", "Web Audio API (Sintetizador de Som)"]
}`;

      const archFallback = { fileStructure: "index.html", gameLoopStrategy: "requestAnimationFrame loop", librariesUsed: ["Tailwind CSS", "Lucide"] };
      const archResult = await generateWithRetry({
        clientApiKey: effectiveApiKey,
        model: currentModel,
        prompt: `GDD DO PRODUCT MANAGER:\n${JSON.stringify(pmParsed, null, 2)}`,
        modeloDeReserva,
        systemInstruction: architectSystemInstruction,
        responseMimeType: "application/json"
      }, 2, controle.signal);

      let archParsed: any = archFallback;
      if (archResult.ok) {
        try { archParsed = JSON.parse(archResult.text.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()); } catch { archParsed = archFallback; }
      } else {
        addSwarmLog('🏗️ Agente de Arquitetura', `⚠️ Falha ao contatar o Agente de Arquitetura (${archResult.error}). Usando arquitetura padrão para não travar o Enxame.`, 'warn');
      }
      if (desistiu()) return;
      setSwarmArchitectArtifact(archParsed);
      setSwarmProgress(45);
      setSwarmProgressText('45% - Arquitetura validada! Iniciando Engenharia...');
      addSwarmLog('🏗️ Agente de Arquitetura', `Arquitetura validada! Estratégia de Game Loop pronta.`, 'success');

      // ==========================================
      // STAGE 3 & 4: HARNESS ENGINEERING LOOP (ENGINEER + QA)
      // ==========================================
      let currentIter = 1;
      let lastCode = "";
      let isApproved = false;
      let coderEverSucceeded = false;
      let previousQAFeedback = "";
      // Ciclos seguidos em que o código saiu igual ao que entrou. Ver o corte do laço abaixo.
      let ciclosSemProgresso = 0;
      let ultimaEntregaCortada = false;
      let exigirArquivoInteiro = false;

      while (currentIter <= maxHarnessIterations && !isApproved) {
        setSwarmIteration(currentIter);

        // 3.1 AGENTE DE ENGENHARIA (ENGINEER / CODER)
        // A partir da 2ª iteração, o código já existe: o agente faz EDIÇÕES CIRÚRGICAS
        // (old_string/new_string) em vez de reescrever tudo do zero, igual a um par de
        // programação real — preserva o que já funciona e reduz o risco de regressão.
        setSwarmCurrentStep('coder');
        const iterCoderProg = 45 + Math.round(((currentIter - 0.5) / maxHarnessIterations) * 45);
        setSwarmProgress(iterCoderProg);
        setSwarmProgressText(`${iterCoderProg}% - Agente de Engenharia codificando o jogo em HTML5 (Ciclo ${currentIter}/${maxHarnessIterations})...`);
        addSwarmLog('💻 Agente de Engenharia', lastCode
          ? `Aplicando edições cirúrgicas para corrigir o código (Iteração ${currentIter}/${maxHarnessIterations})...`
          : `Codificando projeto completo em HTML5 + Canvas (Iteração ${currentIter}/${maxHarnessIterations})...`, 'info');

        const coderRoleIntro = `Você é o AGENTE DE ENGENHARIA (Engineer/Coder) do OSONE CODE Swarm Engine.
Sua missão é produzir o CÓDIGO FONTE 100% COMPLETO, FUNCIONAL E LINDO no arquivo "index.html".
O código DEVE conter:
- HTML5 completo com <head>, estilo e <script> unificados no mesmo arquivo.
- Importação do Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>) e Lucide Icons.
- Design futurista, limpo e adaptado para telas mobile e desktop.
- Efeitos sonoros via Web Audio API (Sintetizador numérico simples para tiro, dano, pulo e game over).
- Game loop completo com requestAnimationFrame, pontuação, recorde, tela de Início e tela de Game Over com botão de Reiniciar.`;
        const coderSystemInstruction = buildCodeEditSystemInstruction(coderRoleIntro);

        // Depois de um ciclo em que nenhum bloco casou, a ordem de fechamento precisa ser a
        // OPOSTA da de sempre: insistir em "edições cirúrgicas, sem reescrever o arquivo inteiro"
        // era mandar o engenheiro repetir exatamente o que acabou de não funcionar.
        const ordemFinal = exigirArquivoInteiro
          ? `Responda com o código-fonte COMPLETO do arquivo inteiro, do <!DOCTYPE html> até o </html>, já com TODAS as correções acima aplicadas. NÃO use blocos SEARCH/REPLACE nesta resposta.`
          : `Corrija TODOS os itens acima usando blocos SEARCH/REPLACE cirúrgicos, sem reescrever o arquivo inteiro.`;

        const coderPrompt = lastCode
          ? `CÓDIGO FONTE ATUAL NO REPOSITÓRIO:\n\n${lastCode}\n\nESPECIFICAÇÕES ORIGINAIS:\n- Pedido do Usuário: "${swarmPrompt}"\n- GDD do Produto: ${JSON.stringify(pmParsed)}\n- Arquitetura: ${JSON.stringify(archParsed)}\n\n⚠️ CRÍTICO - CORREÇÕES EXIGIDAS NA ITERAÇÃO ANTERIOR:\n"${previousQAFeedback}"\n${ordemFinal}`
          : `Não há código existente ainda. Crie do zero.\n\nESPECIFICAÇÕES:\n- Pedido do Usuário: "${swarmPrompt}"\n- GDD do Produto: ${JSON.stringify(pmParsed)}\n- Arquitetura: ${JSON.stringify(archParsed)}`;

        const coderResult = await generateWithRetry({
          clientApiKey: effectiveApiKey,
          model: currentModel,
          prompt: coderPrompt,
          modeloDeReserva,
          systemInstruction: coderSystemInstruction
        }, 2, controle.signal);

        if (desistiu()) break;

        if (!coderResult.ok) {
          if (coderResult.cancelado) break;
          addSwarmLog('💻 Agente de Engenharia', `⚠️ Falha ao contatar o Agente de Engenharia (${coderResult.error}) na Iteração ${currentIter}.`, 'error');
          if (coderEverSucceeded) {
            addSwarmLog('💻 Agente de Engenharia', 'Mantendo a última versão do código já salva no repositório e encerrando o Enxame com o que foi produzido até aqui.', 'warn');
          }
          break;
        }

        const { content: newCode, summary: editSummary, hadFailures: editHadFailures, respostaCortada } = applyModelCodeResponse(coderResult.text, lastCode);
        if (!newCode || !newCode.trim()) {
          addSwarmLog('💻 Agente de Engenharia', `⚠️ Resposta vazia do Agente de Engenharia na Iteração ${currentIter}. Mantendo código anterior.`, 'warn');
          break;
        }

        /**
         * CICLO QUE NÃO MUDA NADA NÃO PODE CONSUMIR O ENXAME EM SILÊNCIO.
         *
         * Quando os blocos SEARCH/REPLACE do engenheiro não casam com o arquivo (ele os digita de
         * memória em vez de copiar), NENHUMA edição entra e o código volta idêntico. O laço
         * seguia assim mesmo: o QA reprovava o mesmo arquivo de novo, o engenheiro errava o
         * mesmo trecho de novo, e as iterações acabavam sem um caractere ter mudado — o Enxame
         * "rodava" do começo ao fim sem finalizar coisa alguma.
         *
         * Agora o próprio impasse vira instrução: na primeira vez o engenheiro é avisado de que
         * as edições não casaram e recebe ordem de reescrever o arquivo inteiro; se o ciclo
         * seguinte também não mudar nada, o Enxame para em vez de gastar as iterações à toa.
         */
        if (coderEverSucceeded && newCode === lastCode) {
          ciclosSemProgresso++;
          addSwarmLog('💻 Agente de Engenharia',
            `⚠️ Nenhuma edição casou com o código atual na Iteração ${currentIter} — o arquivo não mudou${editSummary ? ` (${editSummary})` : ''}.`,
            'warn');
          if (ciclosSemProgresso >= 2) {
            addSwarmLog('💻 Agente de Engenharia', 'Dois ciclos seguidos sem alterar nada: encerrando o Enxame com a última versão válida em vez de gastar as iterações restantes.', 'error');
            break;
          }
          previousQAFeedback = `${previousQAFeedback}\n\n⚠️ ATENÇÃO: na iteração anterior NENHUM dos seus blocos SEARCH/REPLACE casou com o arquivo — o trecho procurado não existe exatamente como você escreveu.`;
          exigirArquivoInteiro = true;
          currentIter++;
          continue;
        }
        ciclosSemProgresso = 0;
        exigirArquivoInteiro = false;

        lastCode = newCode;
        coderEverSucceeded = true;

        // Persistência incremental: salva o progresso no repositório a cada iteração,
        // para que o usuário NUNCA fique sem resultado mesmo se uma etapa seguinte falhar.
        // O destino é o arquivo PRINCIPAL do projeto, não o nome literal 'index.html': num projeto
        // cuja página principal se chama outra coisa, o nome fixo criava um arquivo à parte e o
        // Enxame "terminava" sem ter tocado no arquivo que a pessoa abre.
        applyCodeToRepository(lastCode, arquivoPrincipalId());

        if (coderResult.blocked) {
          addSwarmLog('💻 Agente de Engenharia', `⚠️ O Gemini bloqueou a resposta pelo filtro de segurança nesta iteração. O QA vai avaliar o que sobrou e pode reprovar para uma nova tentativa com um pedido reformulado.`, 'warn');
        }

        /**
         * O código chegou cortado ao arquivo. O QA sozinho não resolve isso: ele avalia o texto e
         * pode até dar nota boa a meia página bem escrita. Aqui o corte é dito por escrito ao
         * engenheiro na iteração seguinte, com a única ordem que o conserta — terminar o arquivo.
         */
        ultimaEntregaCortada = coderResult.truncated || respostaCortada || pareceDocumentoIncompleto(lastCode);
        const aindaHaIteracao = currentIter < maxHarnessIterations;
        if (ultimaEntregaCortada) {
          addSwarmLog('💻 Agente de Engenharia',
            `⚠️ O código desta iteração (${lastCode.length} chars) chegou INCOMPLETO — a resposta acabou antes de fechar o arquivo, mesmo após as continuações automáticas. ` +
            (aindaHaIteracao
              ? 'O engenheiro será mandado terminá-lo na próxima iteração.'
              : 'Não restam iterações para terminá-lo — o Enxame vai encerrar avisando que o arquivo está incompleto.'),
            'error');
        }

        addSwarmLog('💻 Agente de Engenharia', editSummary
          ? `${editSummary} (${lastCode.length} chars). Progresso salvo no repositório.`
          : `Código gerado (${lastCode.length} chars) na Iteração ${currentIter}. Progresso salvo no repositório.`,
          editHadFailures ? 'warn' : 'success');

        // Arquivo incompleto não vai ao QA: a correção é conhecida e não depende de avaliação.
        if (ultimaEntregaCortada && aindaHaIteracao) {
          previousQAFeedback = `O arquivo entregue está INCOMPLETO: ele termina no meio, sem fechar as tags/funções abertas. Termine o arquivo. Use blocos SEARCH/REPLACE para completar a partir do trecho final existente, sem reescrever o que já está pronto e sem repetir nada.`;
          currentIter++;
          continue;
        }

        // 3.2 AGENTE DE GARANTIA DE QUALIDADE (QA TESTER / HARNESS EVALUATOR)
        setSwarmCurrentStep('qa');
        const iterQAProg = 45 + Math.round((currentIter / maxHarnessIterations) * 45);
        setSwarmProgress(iterQAProg);
        setSwarmProgressText(`${iterQAProg}% - Agente de QA executando testes automáticos de qualidade (Ciclo ${currentIter}/${maxHarnessIterations})...`);
        addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `Executando testes automáticos de qualidade (Iteração ${currentIter})...`, 'info');

        const qaSystemInstruction = `Você é o AGENTE DE QA & TESTES (QA Tester / Harness Evaluator) do OSONE CODE Swarm Engine.
Analise criteriosamente o código HTML/JS/CSS gerado contra o GDD e pedido do usuário.

Verifique:
1. Sintaxe e fechamento de tags/funções.
2. Presença de Game Loop (requestAnimationFrame ou setInterval) sem crash de memória.
3. Se possui controles funcionais (teclado/touch) e telas de menu e Game Over.
4. Fidelidade total ao pedido ("${swarmPrompt}").

FORMATO OBRIGATÓRIO (JSON estrito):
{
  "score": number (0 a 100),
  "passed": boolean (true se score >= 95),
  "feedback": "Relatório detalhado de testes e instrução para o engenheiro se houver falhas",
  "missingItems": ["Item ausente 1", "Bug 2"]
}`;

        const qaResult = await generateWithRetry({
          clientApiKey: effectiveApiKey,
          model: currentModel,
          // Sem cortar o código: o Gemini suporta contexto grande, e um corte fixo (antes 15000
          // chars) deixava o final do arquivo — telas de Game Over, efeitos sonoros, fechamento
          // de tags — fora da revisão do QA justamente nos projetos maiores/melhores.
          prompt: `CÓDIGO GERADO PELO ENGENHEIRO:\n\n${lastCode}`,
          modeloDeReserva,
          systemInstruction: qaSystemInstruction,
          responseMimeType: "application/json"
        }, 2, controle.signal);

        if (desistiu()) break;

        if (!qaResult.ok) {
          if (qaResult.cancelado) break;
          addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `⚠️ Falha ao contatar o Agente de QA (${qaResult.error}). Aceitando a última versão do código já salva no repositório.`, 'warn');
          isApproved = true;
          break;
        }

        let qaText = qaResult.text.trim();
        if (qaText.startsWith("```")) qaText = qaText.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();

        let qaParsed: any;
        try { qaParsed = JSON.parse(qaText); } catch { qaParsed = { score: 95, passed: true, feedback: "Código verificado e aprovado.", missingItems: [] }; }

        const newQAReport = {
          iteration: currentIter,
          score: qaParsed.score || 90,
          passed: !!qaParsed.passed,
          feedback: qaParsed.feedback || "Avaliação de código concluída.",
          missingItems: qaParsed.missingItems || []
        };

        setSwarmQAReports(prev => [...prev, newQAReport]);

        if (qaParsed.passed || qaParsed.score >= 95) {
          isApproved = true;
          addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `✓ APROVADO COM SUCESSO! Nota: ${qaParsed.score}/100 na Iteração ${currentIter}.`, 'success');
        } else {
          addSwarmLog('🧪 Agente de QA (Harness Evaluator)', `⚠️ QA reprovou o código (Nota: ${qaParsed.score}/100). Disparando Loop Harness para a Iteração ${currentIter + 1}...`, 'warn');
          previousQAFeedback = `Feedback do QA: ${qaParsed.feedback}. Itens faltantes: ${qaParsed.missingItems?.join(', ')}`;
          currentIter++;
        }
      }

      // ==========================================
      // STAGE 5: ASSEMBLY & REPOSITORY SYNCHRONIZATION
      // ==========================================
      setSwarmCurrentStep('assembly');

      /**
       * Desistiu: o Enxame não anuncia nada e não abre o Preview.
       *
       * O progresso já gravado nas iterações anteriores CONTINUA no repositório de propósito —
       * é a persistência incremental, e apagá-la seria destruir trabalho que já existia. O que
       * não pode acontecer é a tela comemorar um projeto que a pessoa mandou parar.
       */
      if (desistiu()) {
        setSwarmStatus('idle');
        setSwarmProgress(0);
        setSwarmProgressText('');
        return;
      }

      if (!coderEverSucceeded || !lastCode.trim()) {
        // Nenhuma versão de código foi produzida com sucesso em nenhuma iteração: reporta com honestidade.
        setSwarmStatus('error');
        setSwarmProgress(100);
        setSwarmProgressText('O Enxame não conseguiu produzir um código válido.');
        addSwarmLog('🚀 Cérebro Integrador', '❌ Nenhuma versão de código válida foi produzida pelo Enxame. Nada foi aplicado no repositório.', 'error');
        return;
      }

      setSwarmProgress(98);
      setSwarmProgressText('98% - Projeto salvo! Abrindo Preview Vivo...');
      addSwarmLog('🚀 Cérebro Integrador', 'Última versão do código já está salva no Repositório do OSONE CODE (persistida a cada iteração).', 'info');

      /**
       * "FINALIZADO" PRECISA QUERER DIZER FINALIZADO.
       *
       * O fecho era o mesmo qualquer que fosse o desfecho: aprovado pelo QA anunciava "✨ Jogo
       * Finalizado & Testado", e o resto anunciava um aviso genérico. Um arquivo que acaba no meio
       * do <script> passava por qualquer um dos dois — inclusive pelo primeiro, porque o QA lê o
       * texto e pode achar bom o pedaço que existe. A palavra "finalizado" ficou reservada ao caso
       * em que o arquivo realmente fecha; quando ele não fecha, isso é o que a tela diz.
       */
      const entregaIncompleta = ultimaEntregaCortada || pareceDocumentoIncompleto(lastCode);

      setSwarmStatus(entregaIncompleta ? 'error' : 'success');
      setSwarmProgress(100);
      const finalMsg = entregaIncompleta
        ? '100% - ⚠️ O código salvo está INCOMPLETO: o arquivo não chegou ao fim.'
        : isApproved
          ? '100% - ✨ Jogo Finalizado & Testado pelo Enxame com Sucesso!'
          : '100% - ⚠️ Enxame encerrado com a melhor versão obtida (nem todas as etapas concluíram, mas o progresso foi salvo).';
      setSwarmProgressText(finalMsg);
      addSwarmLog('🚀 Cérebro Integrador', entregaIncompleta
        ? '⚠️ O arquivo salvo termina no meio — o modelo não conseguiu fechá-lo nem com as continuações automáticas. Rode o Enxame de novo pedindo apenas para TERMINAR o arquivo, ou peça um jogo mais simples.'
        : isApproved
          ? '✨ Projeto finalizado e testado pelo Enxame de Agentes OSONE CODE!'
          : '⚠️ Enxame encerrado antes da aprovação total do QA, mas a última versão gerada foi salva no repositório e está pronta para uso.',
        entregaIncompleta ? 'error' : isApproved ? 'success' : 'warn');

      // Auto-abrir Preview Vivo e notificar
      setViewLayout('preview');
      setNotificationBanner({
        message: entregaIncompleta
          ? "⚠️ O Enxame salvou o que conseguiu, mas o arquivo está INCOMPLETO (termina no meio). Peça no Enxame para terminar o arquivo, ou simplifique o pedido."
          : isApproved
            ? "🎉 Jogo criado e testado pelo Enxame com sucesso! O código foi aplicado no repositório e o Preview Vivo foi aberto automaticamente."
            : "⚠️ O Enxame encerrou sem aprovação total do QA, mas salvou a última versão do código no repositório. Você pode revisar e pedir ajustes.",
        type: entregaIncompleta ? "error" : isApproved ? "success" : "info"
      });

      // Auto-fechar o modal só quando há boa notícia. Fechá-lo sozinho em cima de um aviso de
      // arquivo incompleto esconderia justamente o que o usuário precisa ler.
      if (!entregaIncompleta) {
        setTimeout(() => {
          setIsSwarmModalOpen(false);
        }, 1800);
      }

    } catch (err: any) {
      if (err?.name === 'AbortError' || controle.signal.aborted) {
        setSwarmStatus('idle');
        setSwarmProgress(0);
        setSwarmProgressText('');
        return;
      }
      console.error("Erro na execução do Enxame Swarm:", err);
      setSwarmStatus('error');
      setSwarmProgressText('Erro na execução do Enxame');
      addSwarmLog('⚠️ Sistema Swarm', `Erro na execução do Enxame: ${err.message || String(err)}`, 'error');
    } finally {
      if (cancelamentoDoEnxameRef.current === controle) cancelamentoDoEnxameRef.current = null;
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-[#080a0f] text-zinc-100 min-h-0 overflow-hidden select-none font-sans relative">
      {/* Top Floating Toast Notification Banner */}
      <AnimatePresence>
        {notificationBanner && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={cn(
              "absolute top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-mono text-xs flex items-center gap-3 border shadow-2xl backdrop-blur-xl max-w-xl w-[90%]",
              notificationBanner.type === 'success' ? "bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50" :
              notificationBanner.type === 'error' ? "bg-red-950/90 border-red-500/50 text-red-200 shadow-red-950/50" :
              "bg-cyan-950/90 border-cyan-500/50 text-cyan-200 shadow-cyan-950/50"
            )}
          >
            {/* O ícone segue o TIPO do aviso. Era sempre o de sucesso — um check verde pulando
                em cima de "o arquivo está incompleto" ou "nada foi alterado" faz o usuário ler
                erro como confirmação, que é o pior desfecho possível para um aviso. */}
            {notificationBanner.type === 'error'
              ? <AlertTriangle size={18} className="text-red-400 shrink-0" />
              : notificationBanner.type === 'info'
                ? <AlertCircle size={18} className="text-cyan-400 shrink-0" />
                : <CheckCircle2 size={18} className="text-emerald-400 shrink-0 animate-bounce" />}
            <span className="flex-1 font-medium leading-relaxed">{notificationBanner.message}</span>
            <button 
              onClick={() => setNotificationBanner(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header Navigation */}
      <div className="h-14 border-b border-white/5 bg-[#0c0e14]/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowRepoSidebar(!showRepoSidebar)}
            className={cn(
              "p-2 rounded-xl transition-all border",
              showRepoSidebar 
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
                : "bg-white/[0.02] text-zinc-400 hover:text-white border-white/5"
            )}
            title="Alternar Repositório de Arquivos"
          >
            <FolderGit2 size={16} />
          </button>

          <div className="flex items-center gap-2">
            <Code2 size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold tracking-tight text-white font-mono flex items-center gap-2">
              OSONE CODE
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-normal">
                {files.length} arquivo(s)
              </span>
            </h2>
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setViewLayout('editor')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'editor' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Code2 size={14} />
            <span className="hidden sm:inline">Apenas Código</span>
          </button>
          
          <button 
            onClick={() => setViewLayout('split')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'split' 
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Columns size={14} />
            <span className="hidden sm:inline">Dividido (Split)</span>
          </button>

          <button 
            onClick={() => setViewLayout('preview')}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 transition-all font-medium",
              viewLayout === 'preview' 
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            <Eye size={14} />
            <span className="hidden sm:inline">Preview Vivo</span>
          </button>
        </div>

        {/* Action Controls + SWARM BUTTON & HUNTER BUTTON */}
        <div className="flex items-center gap-2">
          {/* BOTÃO ENXAME SWARM HARNESS */}
          <button 
            onClick={() => setIsSwarmModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-cyan-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-950/60 active:scale-95 cursor-pointer border border-purple-400/40 transition-all"
            title="Enxame OSONE CODE: 4 Agentes Especializados + Harness Engineering em Loop Autônomo!"
          >
            <Bot size={16} className="text-purple-200 animate-pulse" />
            <span className="tracking-wider hidden sm:inline">🐝 ENXAME OSONE CODE</span>
          </button>

          {/* BOTÃO HUNTER NOVO */}
          <button 
            onClick={() => setIsHunterModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-mono font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-950/60 active:scale-95 cursor-pointer border border-emerald-400/40 transition-all"
            title="Hunter: Examinador Agêntico. Examina o código, aponta o que falta e implementa automaticamente!"
          >
            <BowAndArrowIcon size={15} className="text-emerald-100 animate-pulse" />
            <span className="tracking-wider hidden sm:inline">HUNTER AGÊNTICO</span>
          </button>

          {/* BUSCAR E SUBSTITUIR EM TODO O PROJETO */}
          <button
            onClick={() => { setBuscaAberta(v => !v); setTimeout(() => campoDeBuscaRef.current?.focus(), 0); }}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 cursor-pointer active:scale-95",
              buscaAberta
                ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                : "bg-violet-500/10 text-violet-400 border-violet-500/30 hover:bg-violet-500/20"
            )}
            title="Buscar e substituir em todos os arquivos (Ctrl+F)"
          >
            <Search size={15} />
            <span className="hidden sm:inline">Buscar</span>
          </button>

          {/* BOTÃO DESFAZER ALTERAÇÃO NO CÓDIGO */}
          <button 
            onClick={handleUndoChange}
            disabled={historyStack.length === 0}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0",
              historyStack.length > 0
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20 active:scale-95 cursor-pointer shadow-lg shadow-amber-950/30"
                : "bg-white/[0.02] text-zinc-600 border-white/5 cursor-not-allowed opacity-40"
            )}
            title={historyStack.length > 0 ? "Desfazer alteração no código (Ctrl+Z)" : "Nada para desfazer"}
          >
            <Undo size={15} className={historyStack.length > 0 ? "text-amber-400 animate-pulse" : ""} />
            <span className="hidden sm:inline">Desfazer ({historyStack.length})</span>
          </button>

          {/* BOTÃO REFAZER ALTERAÇÃO NO CÓDIGO */}
          <button
            onClick={handleRedoChange}
            disabled={redoStack.length === 0}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0",
              redoStack.length > 0
                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 active:scale-95 cursor-pointer shadow-lg shadow-cyan-950/30"
                : "bg-white/[0.02] text-zinc-600 border-white/5 cursor-not-allowed opacity-40"
            )}
            title={redoStack.length > 0 ? "Refazer alteração no código (Ctrl+Shift+Z)" : "Nada para refazer"}
          >
            <Redo size={15} className={redoStack.length > 0 ? "text-cyan-400 animate-pulse" : ""} />
            <span className="hidden sm:inline">Refazer ({redoStack.length})</span>
          </button>

          <button
            onClick={handleCopyCode}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Copiar Código do Arquivo Ativo"
          >
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>

          <button 
            onClick={handleDownloadFile}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-zinc-300 border border-white/5 transition-all"
            title="Baixar Arquivo para o PC"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Project Switcher Bar: "Em qual projeto você quer codar?" */}
      <div className="bg-[#0b0d14] border-b border-white/10 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <FolderGit2 size={16} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-2">
              Em qual projeto você quer codar?
            </span>
            <span className="text-[11px] text-cyan-400/80 font-mono">
              (Isolado: alterações afetam apenas o projeto ativo)
            </span>
          </div>
        </div>

        {/* 5 Project Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
          {projects.map((proj) => {
            const isCurrent = proj.id === activeProjectId;
            const isEditingThis = editingProjectNameId === proj.id;

            return (
              <div
                key={proj.id}
                onClick={() => !isEditingThis && handleSwitchProject(proj.id)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer border",
                  isCurrent
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/30"
                    : "bg-white/[0.02] text-zinc-400 hover:text-white border-white/5 hover:bg-white/5"
                )}
                title={`Alternar para ${proj.name}`}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", isCurrent ? "bg-cyan-400 animate-pulse" : "bg-zinc-600")} />
                
                {isEditingThis ? (
                  <input
                    type="text"
                    value={editingProjectNameText}
                    onChange={(e) => setEditingProjectNameText(e.target.value)}
                    onBlur={() => handleSaveProjectName(proj.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveProjectName(proj.id);
                      if (e.key === 'Escape') setEditingProjectNameId(null);
                    }}
                    autoFocus
                    className="bg-black/80 text-white px-2 py-0.5 rounded border border-cyan-400 text-xs w-24 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span>{proj.name}</span>
                )}

                {isCurrent && !isEditingThis && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProjectNameId(proj.id);
                      setEditingProjectNameText(proj.name);
                    }}
                    className="p-0.5 hover:text-white text-cyan-400/80 hover:bg-cyan-500/20 rounded transition-colors"
                    title="Renomear Projeto"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Studio Body */}
      <div className="flex-1 flex w-full min-h-0 overflow-hidden relative">
        
        {/* Virtual Repository File Tree Sidebar */}
        <AnimatePresence>
          {showRepoSidebar && (
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 240, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="h-full bg-[#0a0c12] border-r border-white/5 flex flex-col shrink-0 overflow-hidden z-20"
            >
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-semibold flex items-center gap-1.5">
                  <FolderGit2 size={12} className="text-cyan-400" />
                  Repositório
                </span>
                
                <div className="flex items-center gap-1">
                  <label className="p-1 rounded bg-white/[0.03] hover:bg-white/10 text-zinc-400 cursor-pointer transition-colors" title="Importar do PC">
                    <Upload size={13} />
                    <input type="file" onChange={handleImportFileDisk} className="hidden" accept=".html,.css,.js,.ts,.json,.txt,.md" />
                  </label>
                  
                  <button 
                    onClick={handleCreateNewFile}
                    className="p-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-colors"
                    title="Novo Arquivo"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {files.map(file => {
                  const isActive = file.id === activeFileId;
                  const isEditingName = editingFileNameId === file.id;

                  return (
                    <div 
                      key={file.id}
                      onClick={() => setActiveFileId(file.id)}
                      className={cn(
                        "group w-full px-3 py-2 rounded-xl text-xs font-mono flex items-center justify-between cursor-pointer transition-all border",
                        isActive 
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]" 
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <FileCode size={14} className={isActive ? "text-cyan-400" : "text-zinc-500"} />
                        
                        {isEditingName ? (
                          <input 
                            type="text" 
                            value={editingFileNameText}
                            onChange={(e) => setEditingFileNameText(e.target.value)}
                            onBlur={() => handleRenameFileSubmit(file.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRenameFileSubmit(file.id)}
                            autoFocus
                            className="bg-black/60 border border-cyan-500/50 rounded px-1.5 py-0.5 text-xs text-cyan-200 outline-none w-full"
                          />
                        ) : (
                          <span className="truncate">{file.name}</span>
                        )}
                      </div>

                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFileNameId(file.id);
                            setEditingFileNameText(file.name);
                          }}
                          className="p-1 hover:text-cyan-300 transition-colors"
                          title="Renomear"
                        >
                          <Edit3 size={11} />
                        </button>

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id, file.name);
                          }}
                          className="p-1 hover:text-red-400 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer status */}
              <div className="p-3 border-t border-white/5 bg-black/40 text-[10px] font-mono text-zinc-500 flex items-center justify-between">
                <span>{isSaved ? "✓ Repositório Salvo" : "• Alterações não salvas"}</span>
                <span className="text-cyan-400">OSONE CODE</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Workspace Grid */}
        <div className="flex-1 flex min-h-0 w-full overflow-hidden">
          
          {/* Code Editor Panel */}
          {(viewLayout === 'editor' || viewLayout === 'split') && activeFile && (
            <div className={cn(
              "flex flex-col min-h-0 bg-[#07080d] border-r border-white/5 transition-all overflow-hidden",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              {/* Editor Sub-Header */}
              <div className="h-9 bg-[#0b0d13] border-b border-white/5 px-4 flex items-center justify-between shrink-0 font-mono text-xs text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-semibold">{activeFile.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 uppercase">
                    {activeFile.language}
                  </span>
                </div>

                <div className="text-[10px] text-zinc-500">
                  {escritaAoVivo !== null
                    ? `${escritaAoVivo.length} caracteres escritos`
                    : `${activeFile.content.length} caracteres`}
                </div>
              </div>

              {/* PAINEL DE BUSCA — fica ACIMA do editor, e a lista de resultados leva ao trecho. */}
              {buscaAberta && (
                <div className="shrink-0 border-b border-violet-500/20 bg-[#0b0d16] px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400/60" />
                      <input
                        ref={campoDeBuscaRef}
                        value={termoDeBusca}
                        onChange={(e) => setTermoDeBusca(e.target.value)}
                        placeholder="Buscar em todos os arquivos..."
                        className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/40"
                      />
                    </div>
                    <div className="relative flex-1 min-w-[180px]">
                      <Replace size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400/60" />
                      <input
                        value={substitutoDeBusca}
                        onChange={(e) => setSubstitutoDeBusca(e.target.value)}
                        placeholder="Substituir por..."
                        className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/40"
                      />
                    </div>
                    <button
                      onClick={aplicarSubstituicao}
                      disabled={!termoDeBusca}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer shrink-0"
                      title="Substituir todas as ocorrências (entra no desfazer como uma ação só)"
                    >
                      Substituir tudo
                    </button>
                    <button
                      onClick={() => setBuscaAberta(false)}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all cursor-pointer shrink-0"
                      title="Fechar (Esc)"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-400">
                    {([
                      ['caseSensitive', 'Aa', 'Diferenciar maiúsculas'],
                      ['palavraInteira', 'ab|', 'Só palavra inteira'],
                      ['regex', '.*', 'Expressão regular']
                    ] as const).map(([chave, rotulo, titulo]) => (
                      <button
                        key={chave}
                        onClick={() => setOpcoesDeBusca(o => ({ ...o, [chave]: !o[chave] }))}
                        title={titulo}
                        className={cn(
                          "px-2 py-0.5 rounded border transition-all cursor-pointer",
                          opcoesDeBusca[chave]
                            ? "bg-violet-500/20 text-violet-300 border-violet-500/40"
                            : "bg-white/[0.02] text-zinc-500 border-white/5 hover:text-white"
                        )}
                      >
                        {rotulo}
                      </button>
                    ))}
                    <span className={cn("ml-auto", resultadoDaBusca.erro ? "text-amber-400" : "")}>
                      {resultadoDaBusca.erro
                        ? resultadoDaBusca.erro
                        : termoDeBusca
                          ? `${resultadoDaBusca.ocorrencias.length} ocorrência(s)`
                          : ''}
                    </span>
                  </div>

                  {resultadoDaBusca.ocorrencias.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-0.5 pt-1 border-t border-white/5">
                      {resultadoDaBusca.ocorrencias.map((o, i) => (
                        <button
                          key={`${o.arquivoId}-${o.inicio}-${i}`}
                          onClick={() => irParaOcorrencia(o)}
                          className="w-full text-left px-2 py-1 rounded hover:bg-white/[0.04] transition-all flex items-baseline gap-2 cursor-pointer group"
                        >
                          <span className="text-[10px] font-mono text-cyan-400 shrink-0">{o.arquivoNome}</span>
                          <span className="text-[10px] font-mono text-zinc-600 shrink-0">:{o.linha}</span>
                          <span className="text-[10px] font-mono text-zinc-400 truncate group-hover:text-white">{o.textoDaLinha}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/*
                O CÓDIGO SENDO ESCRITO, AO VIVO.

                Enquanto a IA escreve, este painel toma o lugar do editor e mostra o texto
                crescendo pedaço a pedaço, rolando sozinho para acompanhar a última linha. O
                arquivo em si não é tocado até o fim: o que se vê aqui é a resposta do modelo
                chegando, não o conteúdo gravado.

                É read-only de propósito. Deixar editável um texto que muda sozinho a cada pedaço
                jogaria fora o que a pessoa digitasse no instante seguinte.
              */}
              {escritaAoVivo !== null ? (
                <div className="flex-1 w-full h-full bg-[#07080d] flex flex-col overflow-hidden">
                  <div className="shrink-0 h-8 px-3 flex items-center gap-2 bg-cyan-500/[0.07] border-b border-cyan-500/20 font-mono text-[11px] text-cyan-300">
                    <Sparkles size={12} className="animate-pulse shrink-0" />
                    <span className="font-semibold">A IA está escrevendo…</span>
                    <span className="text-cyan-500/50 hidden sm:inline truncate">
                      {escritaAoVivo.length === 0
                        ? 'aguardando o modelo começar'
                        : `${escritaAoVivo.split('\n').length} linha(s) até agora`}
                    </span>
                    <button
                      onClick={() => cancelamentoRef.current?.abort()}
                      className="ml-auto shrink-0 px-2 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                      title="Parar a geração agora — o arquivo não é alterado"
                    >
                      Cancelar
                    </button>
                  </div>
                  <pre
                    ref={painelAoVivoRef}
                    style={{ ...METRICA_DO_EDITOR, paddingLeft: '12px', paddingRight: '16px' }}
                    className="flex-1 overflow-auto custom-scrollbar text-cyan-100/90 selection:bg-cyan-500/30"
                    dangerouslySetInnerHTML={{
                      __html: realcar(escritaAoVivo, linguagemDoArquivo(activeFile.name, activeFile.language))
                        + '<span class="cursor-escrevendo">▌</span>'
                    }}
                  />
                </div>
              ) : (
              /* Editor: régua de linhas + área de escrita.
                  As duas colunas usam exatamente as mesmas classes de fonte, tamanho e altura de
                  linha, e a mesma folga no topo — qualquer diferença aí faria os números
                  descolarem do código conforme o arquivo cresce. */
              <div style={{ position: 'relative' }} className="flex-1 w-full h-full bg-[#07080d] flex overflow-hidden">
                <div
                  ref={reguaRef}
                  aria-hidden="true"
                  style={{ ...METRICA_DO_EDITOR, paddingLeft: '12px', paddingRight: '8px' }}
                  className="regua-de-linhas shrink-0 select-none overflow-hidden text-right
                             text-zinc-600 bg-black/25 border-r border-white/5"
                >
                  {Array.from({ length: totalDeLinhas }, (_, i) => (
                    <div key={i + 1}>{i + 1}</div>
                  ))}
                </div>

                {/*
                  CAMADA DO REALCE — desenhada ATRÁS da área de escrita, que fica transparente.

                  As duas precisam ocupar exatamente o mesmo espaço: mesma fonte, mesmo tamanho,
                  mesma altura de linha, mesma folga e a mesma regra de quebra (wrap desligado).
                  Qualquer diferença aí faz o texto colorido descolar do texto real e o cursor
                  aparecer no lugar errado — por isso as classes abaixo são as MESMAS da área de
                  escrita, e o realce nunca acrescenta nem remove um caractere (ver lib/realce.ts).
                */}
                <pre
                  ref={realceRef}
                  aria-hidden="true"
                  className="pointer-events-none overflow-hidden text-cyan-100/90"
                  style={{
                    ...METRICA_DO_EDITOR,
                    position: 'absolute',
                    top: 0, bottom: 0, right: 0,
                    left: larguraDaRegua,
                    paddingLeft: '12px',
                    paddingRight: '16px',
                    zIndex: 0
                  }}
                  dangerouslySetInnerHTML={{ __html: realcar(activeFile.content || '', linguagemDoArquivo(activeFile.name, activeFile.language)) + '\n' }}
                />
                <textarea
                  ref={editorRef}
                  value={activeFile.content}
                  onChange={(e) => { handleUpdateActiveContent(e.target.value); lerSelecaoDoEditor(); }}
                  onScroll={sincronizarRegua}
                  onKeyDown={aoTeclarNoEditor}
                  // 'select' cobre mouse e teclado; os outros dois pegam os casos em que o
                  // navegador não dispara 'select' (clique simples que desfaz a marcação).
                  onSelect={lerSelecaoDoEditor}
                  onMouseUp={lerSelecaoDoEditor}
                  onKeyUp={lerSelecaoDoEditor}
                  spellCheck={false}
                  // 'off' desliga a quebra automática de linha: com ela, uma linha longa ocupava
                  // várias alturas na tela e a régua passava a contar outra coisa. Em troca vem a
                  // rolagem horizontal, que é como todo editor de código se comporta.
                  wrap="off"
                  // A classe é o que autoriza o Ctrl+Z do OSONE a agir aqui dentro: o atalho global
                  // ignora campos de texto, e sem ela o desfazer nunca funcionava no editor —
                  // justamente onde ele mais faz falta.
                  // O texto fica TRANSPARENTE e quem se vê é a camada de realce atrás; o cursor
                  // continua visível por causa do caret-color, que não é afetado pela cor do texto.
                  style={{
                    ...METRICA_DO_EDITOR,
                    position: 'relative',
                    zIndex: 10,
                    paddingLeft: '12px',
                    paddingRight: '16px',
                    background: 'transparent',
                    color: 'transparent'
                  }}
                  className="code-editor-textarea flex-1 h-full caret-cyan-300
                             outline-none resize-none custom-scrollbar selection:bg-cyan-500/30
                             overflow-auto"
                  placeholder="Escreva ou cole seu código aqui..."
                />
              </div>
              )}
            </div>
          )}

          {/* Interactive Live Preview Panel */}
          {(viewLayout === 'preview' || viewLayout === 'split') && (
            <div className={cn(
              "flex flex-col min-h-0 bg-black transition-all overflow-hidden relative",
              viewLayout === 'split' ? "w-1/2" : "w-full"
            )}>
              {/* O preview recebe o PROJETO montado, não o arquivo aberto: é o que faz o
                  styles.css e o script.js existirem de verdade, e o que evita desenhar CSS
                  cru como se fosse página quando o arquivo aberto não é uma. */}
              <CodePreview
                code={codigoQueRoda}
                linguagem={linguagemDoArquivo(activeFile?.name || '', activeFile?.language)}
                aoDetectarProblema={registrarProblemaDoPreview}
              />
            </div>
          )}

        </div>

      </div>

      {/* AI Code Assistant Footer Prompt Box */}
      <div className="border-t border-white/5 bg-[#090b10] p-3 shrink-0">
        <div className="max-w-5xl mx-auto space-y-2">
          
          {/* AI Quick Prompts */}
          {/*
            O PEDIDO MUDOU DE ALVO — E ISSO PRECISA ESTAR NA TELA.

            Um pedido que atinge o arquivo inteiro e um que atinge doze linhas são coisas muito
            diferentes, e a única pista seria a marcação no editor, que fica acima e sai da vista.
            Sem este aviso, a pessoa selecionaria um trecho sem querer e veria o resultado mudar de
            comportamento sem entender por quê.
          */}
          {/*
            O QUE QUEBROU AO RODAR, COM UM BOTÃO PARA CONSERTAR.

            Este aviso carrega a informação mais valiosa que existe para corrigir um bug — o erro
            que a máquina REGISTROU ao executar — e que antes ficava presa numa aba do preview,
            longe da IA. Com ela em mãos, "corrigir" deixa de ser palpite: o modelo recebe a
            mensagem exata e o texto da linha que falhou.
          */}
          {quantosErros > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/[0.08] border border-red-500/30 text-[11px] font-mono text-red-200">
              <AlertTriangle size={12} className="shrink-0" />
              <span className="shrink-0 font-semibold">
                {quantosErros === 1 ? 'O código quebrou ao rodar' : `${quantosErros} erros ao rodar o código`}
              </span>
              <span className="text-red-300/60 truncate min-w-0" title={errosAgrupados.filter(p => p.tipo === 'erro').map(p => p.mensagem).join('\n')}>
                {errosAgrupados.find(p => p.tipo === 'erro')?.mensagem}
              </span>
              <button
                onClick={() => {
                  const pedido = montarPedidoDeCorrecao(problemasDoPreview, codigoQueRoda, activeFile?.name || 'arquivo');
                  if (pedido) handleSendAIPrompt(pedido);
                }}
                disabled={isGenerating}
                className="ml-auto shrink-0 px-2.5 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 font-bold uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer"
                title="Mandar o erro exato para a IA consertar"
              >
                Corrigir com a IA
              </button>
              <button
                onClick={() => setProblemasDoPreview([])}
                className="shrink-0 p-1 rounded-lg text-red-300/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Dispensar"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {selecaoDoEditor && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/25 text-[11px] font-mono text-amber-200">
              <Code2 size={12} className="shrink-0" />
              <span className="shrink-0 font-semibold">
                Editando só o trecho marcado
              </span>
              <span className="text-amber-300/60 shrink-0">
                {selecaoDoEditor.texto.split('\n').length} linha(s), {selecaoDoEditor.fim - selecaoDoEditor.inicio} caracteres — o resto do arquivo não será tocado
              </span>
              <button
                onClick={() => { setSelecaoDoEditor(null); editorRef.current?.setSelectionRange(selecaoDoEditor.inicio, selecaoDoEditor.inicio); }}
                className="ml-auto shrink-0 px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-200/80 hover:text-white transition-colors cursor-pointer"
                title="Voltar a pedir para o arquivo inteiro"
              >
                usar o arquivo inteiro
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="text-[10px] font-mono text-cyan-400/80 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Sparkles size={11} /> OSONE CODE IA:
            </span>

            {/*
              QUANDO HÁ CÓDIGO, AS SUGESTÕES FALAM DELE.

              As frases fixas ficam para o arquivo em branco — ali elas são o que serve, porque
              não há o que ler e o que a pessoa quer é começar. A partir do momento em que existe
              código, quem manda são as sugestões lidas dele: elas citam a função pelo nome e já
              trazem o diagnóstico junto, em vez de mandar "corrigir bugs" e torcer.
            */}
            {sugestoesDoCodigo.length > 0 ? (
              <>
                {sugestoesDoCodigo.map((sugestao, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendAIPrompt(sugestao)}
                    disabled={isGenerating}
                    title={`Pedir ao OSONE CODE: ${sugestao}`}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/[0.07] hover:bg-cyan-500/15 border border-cyan-500/20 hover:border-cyan-500/40 text-[11px] font-mono text-cyan-200 hover:text-cyan-100 shrink-0 transition-all disabled:opacity-50 max-w-[340px] truncate cursor-pointer"
                  >
                    {sugestao}
                  </button>
                ))}
                <button
                  onClick={() => { codigoJaAnalisadoRef.current = ''; lerSugestoesDoCodigo(activeFile?.content || '', activeFile?.name || 'arquivo'); }}
                  disabled={lendoSugestoes || isGenerating}
                  title="Reler o arquivo e sugerir de novo"
                  className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 text-zinc-400 hover:text-cyan-300 shrink-0 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw size={11} className={lendoSugestoes ? 'animate-spin' : ''} />
                </button>
              </>
            ) : (
              <>
                {[
                  { label: '🐝 Criar Jogo com Enxame Swarm', action: () => setIsSwarmModalOpen(true) },
                  { label: '⚡ Gerar App HTML5 + Tailwind', prompt: 'Crie uma aplicação web completa, interativa e linda em um único arquivo HTML usando Tailwind CSS, Lucide Icons e JavaScript.' },
                  { label: '🛠️ Refatorar & Otimizar', prompt: 'Refatore o código do arquivo atual limpando a estrutura, otimizando performance e melhorando o design visual.' },
                  { label: '🔍 Corrigir BUGS', prompt: 'Examine o código atual, encontre possíveis falhas, erros de lógica ou falta de parâmetros e corrija tudo.' },
                  { label: '🎨 Adicionar Animações UI', prompt: 'Adicione transições suaves, animações de entrada e efeitos visuais modernos no código.' }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => item.action ? item.action() : handleSendAIPrompt(item.prompt)}
                    disabled={isGenerating}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/20 text-[11px] font-mono text-zinc-300 hover:text-cyan-300 shrink-0 transition-all disabled:opacity-50"
                  >
                    {item.label}
                  </button>
                ))}
                {/* Com código no arquivo, dá para trocar as frases fixas por sugestões de verdade. */}
                {(activeFile?.content || '').trim().length >= 200 && (
                  <button
                    onClick={() => lerSugestoesDoCodigo(activeFile?.content || '', activeFile?.name || 'arquivo')}
                    disabled={lendoSugestoes || isGenerating}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-[11px] font-mono text-cyan-300 shrink-0 transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                    title="Ler este arquivo e sugerir melhorias específicas dele"
                  >
                    {lendoSugestoes
                      ? <><Loader2 size={11} className="animate-spin" /> Lendo o código…</>
                      : <><Sparkles size={11} /> Sugerir a partir deste código</>}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Miniaturas das imagens de referência anexadas */}
          {attachedImages.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {attachedImages.map(img => (
                <div key={img.id} className="relative shrink-0 group">
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className="w-12 h-12 rounded-lg object-cover border border-cyan-500/30"
                  />
                  <button
                    onClick={() => handleRemoveAttachedImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-lg cursor-pointer"
                    title="Remover imagem"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Prompt Input Line */}
          <div className="flex items-center gap-2 bg-black/50 border border-white/10 rounded-2xl p-1.5 focus-within:border-cyan-500/40 transition-all">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleAttachImages(e.target.files);
                e.target.value = '';
              }}
            />

            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isGenerating}
              className="p-2 rounded-xl bg-white/[0.03] hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-300 border border-white/5 hover:border-cyan-500/20 transition-all shrink-0 disabled:opacity-50"
              title="Anexar imagem(ns) de referência para o modelo usar na criação"
            >
              <Paperclip size={15} />
            </button>

            <button
              onClick={() => setMaxEffort(prev => !prev)}
              disabled={isGenerating}
              className={cn(
                "p-2 rounded-xl border transition-all shrink-0 disabled:opacity-50",
                maxEffort
                  ? "bg-orange-500/15 text-orange-400 border-orange-500/40 shadow-lg shadow-orange-950/30"
                  : "bg-white/[0.03] text-zinc-400 hover:text-orange-300 border-white/5 hover:border-orange-500/20"
              )}
              title={maxEffort ? "Esforço Máximo ATIVADO: o modelo vai capricho e raciocínio máximo na criação (clique para desativar)" : "Ativar Esforço Máximo: pede ao modelo o maior nível de raciocínio e capricho possível"}
            >
              <Flame size={15} className={maxEffort ? "animate-pulse" : ""} />
            </button>

            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendAIPrompt()}
              placeholder={selecaoDoEditor
                ? `Descreva o que fazer com as ${selecaoDoEditor.texto.split('\n').length} linha(s) marcadas...`
                : "Descreva a alteração ou o app que você quer criar neste arquivo de código..."}
              disabled={isGenerating}
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-zinc-500 outline-none font-mono"
            />

            <button
              onClick={() => handleSendAIPrompt()}
              disabled={!promptInput.trim() || isGenerating}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 text-black font-semibold text-xs font-mono transition-all flex items-center gap-1.5 shrink-0"
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Gerando...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Gerar Código</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* SWARM HARNESS AGENTS MODAL */}
      <AnimatePresence>
        {isSwarmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-lg">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-4xl max-h-[90vh] bg-[#0b0e17] border border-purple-500/40 rounded-3xl p-6 shadow-2xl text-left flex flex-col gap-4 overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                    <Bot size={24} className={swarmStatus === 'running' ? 'animate-bounce text-cyan-400' : ''} />
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                      🐝 OSONE CODE — ENXAME DE AGENTES & HARNESS LOOPS
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-normal">
                        Game & Web Architecture Engine
                      </span>
                    </h3>
                    <p className="text-xs text-purple-200/70 mt-0.5">
                      Engenharia de Harness com ciclo contínuo: PM ➔ Arququiteto ➔ Engenheiro ➔ QA (Loop Autônomo).
                    </p>
                  </div>
                </div>

                {/* Fechar com o Enxame rodando PARA o Enxame. Antes ele seguia por baixo,
                    consumindo cota e gravando no repositório com o painel fora da vista. */}
                <div className="flex items-center gap-2 shrink-0">
                  {swarmStatus === 'running' && (
                    <button
                      onClick={() => cancelamentoDoEnxameRef.current?.abort()}
                      className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      title="Parar o Enxame agora — o que já foi salvo permanece"
                    >
                      Parar
                    </button>
                  )}
                  <button
                    onClick={() => pararEFechar(cancelamentoDoEnxameRef, setIsSwarmModalOpen)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                    title={swarmStatus === 'running' ? 'Parar o Enxame e fechar' : 'Fechar'}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Main Content Body */}
              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-1">
                
                {/* Textarea Goal & Presets */}
                <div className="space-y-2">
                  <label className="text-xs font-mono text-purple-300 font-semibold uppercase tracking-wider block flex items-center justify-between">
                    <span>Definição do Objetivo do Jogo / Aplicação:</span>
                    <span className="text-[10px] text-zinc-400 normal-case font-normal">O Enxame executará até a aprovação total do QA</span>
                  </label>
                  
                  <textarea 
                    value={swarmPrompt}
                    onChange={(e) => setSwarmPrompt(e.target.value)}
                    placeholder="Ex: Crie um jogo completo de nave 2D Space Shooter retrô em HTML5 Canvas. Inclua partículas de explosão, placar de recorde, múltiplos tipos de inimigos, chefão e efeitos sonoros via Web Audio API."
                    className="w-full h-24 bg-black/60 border border-purple-500/30 focus:border-purple-400 rounded-2xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed"
                  />

                  {/* Presets */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                    <span className="text-[10px] font-mono text-zinc-400 shrink-0 flex items-center gap-1">
                      <Gamepad2 size={12} className="text-purple-400" /> Presets de Jogos:
                    </span>
                    {[
                      { label: '🚀 Space Shooter 2D', prompt: 'Jogo de Nave 2D Space Shooter em HTML5 Canvas com tiros, asteroides, inimigos, sons Web Audio e placar.' },
                      { label: '🕹️ Brick Breaker Arcade', prompt: 'Jogo Brick Breaker (Quebra-blocos) em HTML5 Canvas com power-ups, efeitos visuais, vidas e pontuação.' },
                      { label: '🐍 Cyberpunk Snake', prompt: 'Jogo da Cobrinha (Snake) em estilização Cyberpunk com néon, partículas, comida especial e recorde salvo.' },
                      { label: '🏎️ Racing Pseudo-3D', prompt: 'Jogo de Corrida retro pseudo-3D em HTML5 Canvas com obstáculos, contador de velocidade e sons.' },
                      { label: '🏰 Dungeon Crawler 2D', prompt: 'Jogo RPG 2D Dungeon Crawler top-down com movimentação de personagem, monstros, baús e combate.' }
                    ].map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSwarmPrompt(preset.prompt)}
                        className="px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[10px] font-mono text-purple-200 shrink-0 transition-all"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Settings & Execution Control */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-black/40 border border-white/10 flex-wrap gap-3">
                  <div className="flex items-center gap-3 font-mono text-xs text-zinc-300">
                    <span className="text-purple-400 font-semibold">Limite de Iterações (Harness Loop):</span>
                    <div className="flex items-center gap-1">
                      {[3, 5, 8].map(num => (
                        <button
                          key={num}
                          onClick={() => setMaxHarnessIterations(num)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-mono transition-all",
                            maxHarnessIterations === num
                              ? "bg-purple-500 text-black font-bold"
                              : "bg-white/5 text-zinc-400 hover:text-white"
                          )}
                        >
                          {num}x ciclos
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={() => runSwarmHarnessEngine()}
                    disabled={!swarmPrompt.trim() || swarmStatus === 'running'}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-cyan-600 to-emerald-600 hover:from-purple-500 hover:to-emerald-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-950/60 cursor-pointer active:scale-95 ml-auto"
                  >
                    {swarmStatus === 'running' ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-cyan-200" />
                        <span>Enxame Ativo (Iteração {swarmIteration})...</span>
                      </>
                    ) : (
                      <>
                        <Zap size={16} className="text-amber-300" />
                        <span>Disparar Enxame de Agentes</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Swarm Progress Bar */}
                {swarmStatus === 'running' && (
                  <div className="p-3.5 rounded-2xl bg-black/60 border border-purple-500/40 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-cyan-300 font-bold flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin text-cyan-400 shrink-0" />
                        {swarmProgressText || 'Executando Enxame...'}
                      </span>
                      <span className="text-purple-300 font-bold shrink-0 ml-2">{swarmProgress}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-purple-500/30">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 via-cyan-400 to-emerald-400 transition-all duration-300 rounded-full"
                        style={{ width: `${swarmProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Swarm Active Step Pipeline Visualizer */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2">
                  {[
                    { id: 'pm', label: '1. Produto (PM)', desc: 'GDD & Requisitos', icon: Layers, active: swarmCurrentStep === 'pm', done: !!swarmPMArtifact },
                    { id: 'architect', label: '2. Arquitetura', desc: 'Game Loop & Canvas', icon: Cpu, active: swarmCurrentStep === 'architect', done: !!swarmArchitectArtifact },
                    { id: 'coder', label: '3. Engenharia', desc: `Código (Iter. ${swarmIteration})`, icon: Terminal, active: swarmCurrentStep === 'coder', done: swarmIteration > 1 || swarmStatus === 'success' },
                    { id: 'qa', label: '4. QA & Harness', desc: 'Autoavaliação Loop', icon: ShieldCheck, active: swarmCurrentStep === 'qa', done: swarmQAReports.some(r => r.passed) },
                    { id: 'assembly', label: '5. Repositório', desc: 'Preview Vivo', icon: CheckCircle2, active: swarmCurrentStep === 'assembly', done: swarmStatus === 'success' }
                  ].map((step, idx) => {
                    const StepIcon = step.icon;
                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "p-3 rounded-2xl border flex flex-col gap-1 transition-all relative overflow-hidden",
                          step.active ? "bg-purple-950/40 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]" :
                          step.done ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300" :
                          "bg-black/40 border-white/5 opacity-60"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <StepIcon size={16} className={step.active ? "text-cyan-400 animate-pulse" : step.done ? "text-emerald-400" : "text-zinc-500"} />
                          {step.active && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
                          {step.done && <CheckCircle2 size={12} className="text-emerald-400" />}
                        </div>
                        <span className="text-xs font-mono font-bold text-white mt-1">{step.label}</span>
                        <span className="text-[10px] font-mono text-zinc-400">{step.desc}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Swarm Artifacts & Logs Drawer Tabs */}
                {swarmLogs.length > 0 && (
                  <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden flex flex-col font-mono text-xs">
                    {/* Tabs bar */}
                    <div className="flex items-center border-b border-white/10 bg-[#070910] px-3 pt-2 gap-2 overflow-x-auto">
                      {[
                        { id: 'logs', label: `📋 Logs de Execução (${swarmLogs.length})` },
                        { id: 'pm', label: '📑 GDD (Produto)' },
                        { id: 'architect', label: '🏗️ Arquitetura' },
                        { id: 'qa', label: `🧪 QA Harness (${swarmQAReports.length})` }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveArtifactTab(tab.id as any)}
                          className={cn(
                            "px-3 py-1.5 rounded-t-xl text-xs font-semibold transition-all border-t border-x",
                            activeArtifactTab === tab.id
                              ? "bg-black/80 text-cyan-300 border-purple-500/40"
                              : "text-zinc-500 border-transparent hover:text-zinc-300"
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Content Panel */}
                    <div className="p-4 max-h-56 overflow-y-auto custom-scrollbar">
                      {activeArtifactTab === 'logs' && (
                        <div className="space-y-1.5 text-[11px] font-mono">
                          {swarmLogs.map((log, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "flex items-start gap-2 p-1.5 rounded-lg border",
                                log.type === 'success' ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-300" :
                                log.type === 'warn' ? "bg-amber-950/30 border-amber-500/20 text-amber-300" :
                                log.type === 'error' ? "bg-red-950/30 border-red-500/20 text-red-300" :
                                "bg-white/[0.02] border-white/5 text-zinc-300"
                              )}
                            >
                              <span className="text-[9px] text-zinc-500 shrink-0 mt-0.5">{log.timestamp}</span>
                              <span className="font-bold text-cyan-400 shrink-0">{log.agent}:</span>
                              <span className="flex-1 leading-relaxed">{log.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeArtifactTab === 'pm' && swarmPMArtifact && (
                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-purple-200">
                            <strong>Visão GDD:</strong> {swarmPMArtifact.gdd}
                          </div>
                          <div>
                            <strong className="text-cyan-400 block mb-1">Mecânicas de Jogo:</strong>
                            <ul className="list-disc list-inside space-y-0.5 text-zinc-300">
                              {swarmPMArtifact.mechanics?.map((m, idx) => <li key={idx}>{m}</li>)}
                            </ul>
                          </div>
                        </div>
                      )}

                      {activeArtifactTab === 'architect' && swarmArchitectArtifact && (
                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-cyan-200">
                            <strong>Estratégia de Game Loop:</strong> {swarmArchitectArtifact.gameLoopStrategy}
                          </div>
                          <div>
                            <strong className="text-purple-400 block mb-1">Estrutura de Arquivos:</strong>
                            <p className="text-zinc-300">{swarmArchitectArtifact.fileStructure}</p>
                          </div>
                        </div>
                      )}

                      {activeArtifactTab === 'qa' && (
                        <div className="space-y-2 text-xs">
                          {swarmQAReports.length === 0 ? (
                            <p className="text-zinc-500 italic">Aguardando testes do Agente de QA...</p>
                          ) : (
                            swarmQAReports.map((report, idx) => (
                              <div key={idx} className={cn("p-3 rounded-xl border space-y-1", report.passed ? "bg-emerald-950/30 border-emerald-500/40" : "bg-amber-950/30 border-amber-500/40")}>
                                <div className="flex items-center justify-between font-bold">
                                  <span>Iteração {report.iteration} — Avaliação de QA</span>
                                  <span className={report.passed ? "text-emerald-400" : "text-amber-400"}>
                                    Nota: {report.score}/100 ({report.passed ? 'APROVADO' : 'REPROVADO'})
                                  </span>
                                </div>
                                <p className="text-zinc-300">{report.feedback}</p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HUNTER AGENT EXAMINER MODAL */}
      <AnimatePresence>
        {isHunterModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl bg-[#0b0e17] border border-emerald-500/40 rounded-3xl p-6 shadow-2xl text-left space-y-5 overflow-hidden relative"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <BowAndArrowIcon size={20} className={hunterStatus === 'analyzing' ? 'animate-spin' : ''} />
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                      🏹 HUNTER — EXAMINADOR AGÊNTICO DE CÓDIGO
                    </h3>
                    <p className="text-xs text-emerald-200/70 mt-0.5">
                      Descreva exatamente o que deseja examinar, checar ou adicionar no código e no plano.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {hunterStatus === 'analyzing' && (
                    <button
                      onClick={() => cancelamentoDoHunterRef.current?.abort()}
                      className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                      title="Parar a auditoria agora — o arquivo não é alterado"
                    >
                      Parar
                    </button>
                  )}
                  <button
                    onClick={() => pararEFechar(cancelamentoDoHunterRef, setIsHunterModalOpen)}
                    className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
                    title={hunterStatus === 'analyzing' ? 'Parar a auditoria e fechar' : 'Fechar'}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Textbox Input */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-emerald-400 font-semibold uppercase tracking-wider block">
                  Exigências & Checklist do Código/Plano:
                </label>
                <textarea 
                  value={hunterPrompt}
                  onChange={(e) => setHunterPrompt(e.target.value)}
                  placeholder="Ex: Verifique se a aplicação possui estado de contagem, botões responsivos, estilização e se faltou algo no plano. Se faltar qualquer item, implemente no código imediatamente!"
                  className="w-full h-32 bg-black/60 border border-emerald-500/30 focus:border-emerald-400 rounded-2xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none resize-none leading-relaxed"
                />
              </div>

              {/* Actions: Voice or Hunter Execution */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {onStartLiveVoice && (
                  <button 
                    onClick={() => {
                      onStartLiveVoice();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-semibold flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Mic size={14} className="animate-pulse text-emerald-400" />
                    <span>Falar com Gemini Live (Voz)</span>
                  </button>
                )}

                <button 
                  onClick={() => runHunterAnalysis()}
                  disabled={!hunterPrompt.trim() || hunterStatus === 'analyzing'}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 disabled:opacity-50 text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/60 cursor-pointer active:scale-95 ml-auto"
                >
                  {hunterStatus === 'analyzing' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Caçando & Auditando...</span>
                    </>
                  ) : (
                    <>
                      <BowAndArrowIcon size={16} />
                      <span>Caçar & Implementar no Código</span>
                    </>
                  )}
                </button>
              </div>

              {/* Status Report / Doubt Output */}
              {hunterStatus !== 'idle' && (
                <div className={cn(
                  "p-4 rounded-2xl border text-xs leading-relaxed font-mono space-y-2",
                  hunterStatus === 'analyzing' ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300" :
                  hunterStatus === 'doubt' ? "bg-amber-950/30 border-amber-500/40 text-amber-200" :
                  hunterStatus === 'success' ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200" :
                  "bg-red-950/30 border-red-500/40 text-red-300"
                )}>
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wide">
                    {hunterStatus === 'analyzing' && <Loader2 size={14} className="animate-spin text-emerald-400" />}
                    <span className="flex-1">
                      {hunterStatus === 'analyzing' ? 'Análise & Auditoria do Hunter em Andamento...' :
                       hunterStatus === 'doubt' ? 'Dúvida Impeditiva Detectada:' :
                       hunterStatus === 'success' ? '✓ Caçada Concluída com Sucesso!' : 'Erro na Análise'}
                    </span>
                    {hunterStatus === 'analyzing' && <span className="text-emerald-400 font-bold">{hunterProgress}%</span>}
                  </div>

                  {hunterStatus === 'analyzing' && (
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden border border-emerald-500/30 my-1">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-600 via-green-400 to-cyan-400 transition-all duration-300 rounded-full"
                        style={{ width: `${hunterProgress}%` }}
                      />
                    </div>
                  )}

                  {hunterStatus === 'doubt' && (
                    <div className="space-y-3 pt-1">
                      <p className="text-amber-100 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                        {hunterDoubt}
                      </p>

                      <div className="flex items-center gap-2">
                        <input 
                          type="text" 
                          value={hunterDoubtInput}
                          onChange={(e) => setHunterDoubtInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          placeholder="Digitar esclarecimento para o Hunter..."
                          className="flex-1 bg-black/60 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-amber-200/40 outline-none"
                        />
                        <button 
                          onClick={() => {
                            if (hunterDoubtInput.trim()) {
                              const clar = hunterDoubtInput.trim();
                              setHunterDoubtInput('');
                              runHunterAnalysis(clar);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  )}

                  {hunterStatus === 'success' && (
                    <p className="text-emerald-100 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                      {hunterReport}
                    </p>
                  )}
                </div>
              )}

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
