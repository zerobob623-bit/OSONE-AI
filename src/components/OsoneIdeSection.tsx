import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Folder, FolderOpen, FileCode, ChevronRight, ChevronDown, Save, X, Link2,
  Terminal as TerminalIcon, AlertTriangle, RefreshCw, Loader2, ArrowLeft, CornerLeftUp,
  Play, CheckCircle2, Eye, Trash2, HardDrive, Lock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { EditorDeCodigo } from './EditorDeCodigo';

/**
 * OSONE IDE — a pasta do computador editada de verdade, e não uma cópia dentro do navegador.
 *
 * O QUE ISTO RESOLVE. O OSONE CODE escreve projetos ótimos, mas eles nascem num espaço próprio: a
 * pessoa pede, ele grava numa pasta que ele mesmo escolheu, e a partir daí toda mudança depende de
 * o modelo ACHAR aquele caminho de novo — caçando por 'listar', chutando nomes de pasta, às vezes
 * criando um projeto novo em vez de mexer no que já existe. Quem já tem um projeto no disco (um
 * repositório clonado, uma pasta de trabalho antiga) fica pior ainda: precisa descrever o caminho
 * em voz alta, torcer para ele ser entendido, e conferir depois se o arquivo certo foi tocado.
 *
 * A ideia aqui é uma só: VINCULAR A PASTA UMA VEZ. Depois disso o caminho deixa de ser algo a
 * descobrir e passa a ser um dado do sistema — a árvore lê aquela pasta, o editor grava naquela
 * pasta, o terminal roda naquela pasta, e o próprio OSONE recebe o caminho pronto quando você pede
 * uma alteração por chat ou por voz. Nada de caçar.
 *
 * NÃO É UM EDITOR DE BRINQUEDO: o arquivo aberto aqui é o arquivo do disco, e salvar sobrescreve
 * o arquivo do disco. Por isso as duas travas que mais importam neste componente são de segurança
 * de dados, não de interface — ver `truncado` (arquivo grande aberto pela metade nunca pode ser
 * salvo) e a confirmação de descarte ao fechar uma aba suja.
 */

export interface ProjetoVinculado {
  caminho: string;
  nome: string;
  vinculadoEm: number;
}

interface EntradaDoDisco {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes: number | null;
}

interface ArquivoAberto {
  caminho: string;
  nome: string;
  conteudo: string;
  /** O que estava no disco na última leitura/gravação. É o que diz se a aba está suja. */
  original: string;
  /**
   * Arquivo grande demais: o Agente Local devolve só o começo. Salvar um conteúdo parcial
   * APAGARIA o resto do arquivo no disco, então estas abas são somente leitura — o aviso na tela
   * existe para que isso não pareça um bug do editor.
   */
  truncado: boolean;
  totalDeLinhas: number;
}

interface Problema {
  arquivo: string;
  problema: string;
}

interface SaidaDeComando {
  id: string;
  comando: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  erro?: string;
}

const CHAVE_DE_PROJETOS = 'osone_ide_projetos';
const CHAVE_DO_ULTIMO = 'osone_ide_ultimo_projeto';

/**
 * O que a árvore esconde por padrão.
 *
 * Uma pasta de projeto real tem mais arquivos de máquina do que de pessoa: `node_modules` sozinha
 * traz dezenas de milhares de entradas e afogaria a árvore no primeiro clique. Nada disso é
 * apagado nem fica inacessível — o botão "ocultos" traz tudo de volta quando for preciso.
 */
const RUIDO_DE_PROJETO = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.cache',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target', 'vendor'
]);

/** Separa o caminho em pasta + nome respeitando o separador do sistema que veio na resposta. */
function separarCaminho(caminho: string): { pasta: string; nome: string } {
  const ehWindows = caminho.includes('\\');
  const partes = caminho.split(/[\\/]/);
  const nome = partes.pop() || caminho;
  const pasta = ehWindows ? partes.join('\\') : (partes.join('/') || '/');
  return { pasta, nome };
}

function nomeDaPasta(caminho: string): string {
  return separarCaminho(caminho.replace(/[\\/]+$/, '')).nome || caminho;
}

function lerProjetosSalvos(): ProjetoVinculado[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DE_PROJETOS) || '[]');
    return Array.isArray(bruto) ? bruto.filter((p: any) => p?.caminho) : [];
  } catch {
    return [];
  }
}

export const OsoneIdeSection = ({
  localAgentToken,
  onBack,
  onNotification,
  onProjetoChange
}: {
  localAgentToken?: string;
  onBack: () => void;
  onNotification: (mensagem: string, tipo?: 'success' | 'error' | 'info') => void;
  /**
   * O elo que faz o OSONE parar de caçar pasta: o App guarda isto e injeta o caminho do projeto
   * no contexto do chat e da voz, para que "arruma o menu" já chegue ao modelo sabendo em qual
   * pasta o menu mora.
   */
  onProjetoChange?: (projeto: ProjetoVinculado | null) => void;
}) => {
  const [token, setToken] = useState(localAgentToken || '');
  const [projeto, setProjeto] = useState<ProjetoVinculado | null>(null);
  const [projetosSalvos, setProjetosSalvos] = useState<ProjetoVinculado[]>(lerProjetosSalvos);

  const [arvore, setArvore] = useState<Record<string, EntradaDoDisco[]>>({});
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [carregandoPastas, setCarregandoPastas] = useState<Set<string>>(new Set());
  const [mostrarOcultos, setMostrarOcultos] = useState(false);

  const [abas, setAbas] = useState<ArquivoAberto[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [problemas, setProblemas] = useState<Problema[] | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [painelInferior, setPainelInferior] = useState<'problemas' | 'terminal' | null>(null);
  const [comando, setComando] = useState('');
  const [rodandoComando, setRodandoComando] = useState(false);
  const [saidas, setSaidas] = useState<SaidaDeComando[]>([]);
  const [urlDoPreview, setUrlDoPreview] = useState<string | null>(null);

  // Navegador de pastas (o "escolher pasta" que o navegador não oferece para o disco real).
  const [navegadorAberto, setNavegadorAberto] = useState(false);
  const [pastaDoNavegador, setPastaDoNavegador] = useState('~');
  const [conteudoDoNavegador, setConteudoDoNavegador] = useState<EntradaDoDisco[]>([]);
  const [caminhoResolvido, setCaminhoResolvido] = useState('');
  const [navegando, setNavegando] = useState(false);
  const [erroDoNavegador, setErroDoNavegador] = useState('');
  const [caminhoManual, setCaminhoManual] = useState('');

  const terminalRef = useRef<HTMLDivElement>(null);

  const arquivoAtivo = abas.find(a => a.caminho === abaAtiva) || null;
  const sujo = !!arquivoAtivo && arquivoAtivo.conteudo !== arquivoAtivo.original;

  // ==========================================================================
  // Conversa com o Agente Local
  // ==========================================================================

  const chamarAgente = useCallback(async (rota: string, corpo: any): Promise<any> => {
    if (!token.trim()) {
      return { error: 'O Agente Local não está com token configurado. Clique em "Conectar o Agente Local" para gerar um.' };
    }
    try {
      const res = await fetch(`/api/agent${rota}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.trim()}` },
        body: JSON.stringify(corpo)
      });
      const dados = await res.json().catch(() => null);
      if (!res.ok) return { error: dados?.error || `Falha na operação (HTTP ${res.status}).` };
      return dados || {};
    } catch (err: any) {
      return { error: `O Agente Local não respondeu: ${err?.message || err}. Ele só existe no OSONE rodando no seu computador.` };
    }
  }, [token]);

  /** Pega o token do próprio agente — só funciona a partir da máquina onde o OSONE roda. */
  const conectarAgente = async () => {
    try {
      const res = await fetch('/api/agent/provision-token');
      const dados = await res.json().catch(() => null);
      if (!res.ok || !dados?.token) {
        onNotification(dados?.error || 'Não foi possível obter o token do Agente Local.', 'error');
        return;
      }
      setToken(dados.token);
      onNotification('Agente Local conectado. Agora é só vincular a pasta do projeto.', 'success');
    } catch {
      onNotification('O Agente Local não respondeu. Ele só existe no OSONE instalado no computador.', 'error');
    }
  };

  useEffect(() => {
    if (localAgentToken && localAgentToken !== token) setToken(localAgentToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAgentToken]);

  // ==========================================================================
  // Vínculo do projeto
  // ==========================================================================

  const guardarProjetos = (lista: ProjetoVinculado[]) => {
    setProjetosSalvos(lista);
    try { localStorage.setItem(CHAVE_DE_PROJETOS, JSON.stringify(lista.slice(0, 12))); } catch { /* cota cheia */ }
  };

  const abrirProjeto = useCallback(async (alvo: ProjetoVinculado) => {
    const resposta = await chamarAgente('/path/list', { target: alvo.caminho });
    if (resposta?.error) {
      onNotification(resposta.error, 'error');
      return;
    }
    if (resposta.isDirectory === false) {
      onNotification('Esse caminho é um arquivo, não uma pasta. Vincule a pasta que contém o projeto.', 'error');
      return;
    }
    // O caminho que o agente devolve é o ABSOLUTO e já resolvido (o "~" vira a pasta real). É ele
    // que fica guardado: um "~/projeto" salvo hoje apontaria para outro lugar em outra máquina, e
    // é justamente o caminho pronto que o modelo precisa receber para não caçar nada.
    const resolvido: ProjetoVinculado = {
      caminho: resposta.path || alvo.caminho,
      nome: alvo.nome || nomeDaPasta(resposta.path || alvo.caminho),
      vinculadoEm: Date.now()
    };

    setProjeto(resolvido);
    setArvore({ [resolvido.caminho]: resposta.entries || [] });
    setExpandidas(new Set([resolvido.caminho]));
    setAbas([]);
    setAbaAtiva(null);
    setProblemas(null);
    setSaidas([]);
    setUrlDoPreview(null);
    onProjetoChange?.(resolvido);

    const semDuplicata = projetosSalvos.filter(p => p.caminho !== resolvido.caminho);
    guardarProjetos([resolvido, ...semDuplicata]);
    try { localStorage.setItem(CHAVE_DO_ULTIMO, resolvido.caminho); } catch { /* cota cheia */ }
    onNotification(`Projeto "${resolvido.nome}" vinculado. O OSONE já sabe o caminho.`, 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chamarAgente, onNotification, onProjetoChange, projetosSalvos]);

  const desvincular = () => {
    setProjeto(null);
    setAbas([]);
    setAbaAtiva(null);
    setArvore({});
    setExpandidas(new Set());
    setProblemas(null);
    setUrlDoPreview(null);
    onProjetoChange?.(null);
    try { localStorage.removeItem(CHAVE_DO_ULTIMO); } catch { /* ignore */ }
  };

  const esquecerProjeto = (caminho: string) => {
    guardarProjetos(projetosSalvos.filter(p => p.caminho !== caminho));
  };

  /** Reabre sozinho o último projeto: é o comportamento de qualquer IDE ao voltar ao trabalho. */
  useEffect(() => {
    if (projeto || !token.trim()) return;
    let ultimo = '';
    try { ultimo = localStorage.getItem(CHAVE_DO_ULTIMO) || ''; } catch { /* ignore */ }
    if (!ultimo) return;
    const salvo = lerProjetosSalvos().find(p => p.caminho === ultimo);
    if (salvo) void abrirProjeto(salvo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ==========================================================================
  // Navegador de pastas
  // ==========================================================================

  const navegarPara = useCallback(async (destino: string) => {
    setNavegando(true);
    setErroDoNavegador('');
    const resposta = await chamarAgente('/path/list', { target: destino });
    setNavegando(false);
    if (resposta?.error) {
      setErroDoNavegador(resposta.error);
      return;
    }
    if (resposta.isDirectory === false) {
      setErroDoNavegador('Isso é um arquivo. Escolha a PASTA do projeto.');
      return;
    }
    setPastaDoNavegador(destino);
    setCaminhoResolvido(resposta.path || destino);
    setConteudoDoNavegador(resposta.entries || []);
  }, [chamarAgente]);

  const abrirNavegador = () => {
    setNavegadorAberto(true);
    void navegarPara(projeto?.caminho || '~');
  };

  const subirUmNivel = () => {
    const base = caminhoResolvido || pastaDoNavegador;
    const { pasta } = separarCaminho(base.replace(/[\\/]+$/, ''));
    if (pasta) void navegarPara(pasta);
  };

  // ==========================================================================
  // Árvore de arquivos
  // ==========================================================================

  const carregarPasta = useCallback(async (caminho: string) => {
    if (arvore[caminho]) return;
    setCarregandoPastas(prev => new Set(prev).add(caminho));
    const resposta = await chamarAgente('/path/list', { target: caminho });
    setCarregandoPastas(prev => {
      const copia = new Set(prev);
      copia.delete(caminho);
      return copia;
    });
    if (resposta?.error) {
      onNotification(resposta.error, 'error');
      return;
    }
    setArvore(prev => ({ ...prev, [caminho]: resposta.entries || [] }));
  }, [arvore, chamarAgente, onNotification]);

  const alternarPasta = async (caminho: string) => {
    const jaAberta = expandidas.has(caminho);
    setExpandidas(prev => {
      const copia = new Set(prev);
      if (jaAberta) copia.delete(caminho);
      else copia.add(caminho);
      return copia;
    });
    if (!jaAberta) await carregarPasta(caminho);
  };

  const recarregarArvore = async () => {
    if (!projeto) return;
    const abertas = Array.from(expandidas);
    setArvore({});
    for (const pasta of abertas) {
      const resposta = await chamarAgente('/path/list', { target: pasta });
      if (!resposta?.error) setArvore(prev => ({ ...prev, [pasta]: resposta.entries || [] }));
    }
    onNotification('Árvore de arquivos recarregada do disco.', 'info');
  };

  // ==========================================================================
  // Abrir, editar e salvar arquivos
  // ==========================================================================

  const abrirArquivo = async (entrada: EntradaDoDisco) => {
    const jaAberto = abas.find(a => a.caminho === entrada.path);
    if (jaAberto) {
      setAbaAtiva(entrada.path);
      return;
    }
    const resposta = await chamarAgente('/read-file', { target: entrada.path });
    if (resposta?.error) {
      onNotification(resposta.error, 'error');
      return;
    }
    const novo: ArquivoAberto = {
      caminho: entrada.path,
      nome: entrada.name,
      conteudo: resposta.content ?? '',
      original: resposta.content ?? '',
      truncado: resposta.truncated === true,
      totalDeLinhas: Number(resposta.totalDeLinhas || 0)
    };
    setAbas(prev => [...prev, novo]);
    setAbaAtiva(novo.caminho);
  };

  const atualizarConteudo = (texto: string) => {
    if (!abaAtiva) return;
    setAbas(prev => prev.map(a => (a.caminho === abaAtiva ? { ...a, conteudo: texto } : a)));
  };

  const salvarArquivo = useCallback(async () => {
    const alvo = abas.find(a => a.caminho === abaAtiva);
    if (!alvo || salvando) return;
    if (alvo.truncado) {
      onNotification('Este arquivo foi aberto só em parte (é grande demais). Salvar apagaria o resto — por isso ele está somente leitura.', 'error');
      return;
    }
    if (alvo.conteudo === alvo.original) return;

    setSalvando(true);
    const { pasta, nome } = separarCaminho(alvo.caminho);
    const resposta = await chamarAgente('/write-file', { folder: pasta, fileName: nome, content: alvo.conteudo });
    setSalvando(false);

    if (resposta?.error) {
      onNotification(`Não foi possível salvar: ${resposta.error}`, 'error');
      return;
    }
    setAbas(prev => prev.map(a => (a.caminho === alvo.caminho ? { ...a, original: a.conteudo } : a)));
    onNotification(`"${nome}" salvo no disco.`, 'success');
  }, [abas, abaAtiva, salvando, chamarAgente, onNotification]);

  const fecharAba = (caminho: string) => {
    const alvo = abas.find(a => a.caminho === caminho);
    // Fechar uma aba suja joga fora trabalho que não está em lugar nenhum: o arquivo do disco
    // ainda tem a versão antiga. Um confirm() é feio, mas perder edição em silêncio é pior.
    if (alvo && alvo.conteudo !== alvo.original) {
      const seguir = window.confirm(`"${alvo.nome}" tem alterações não salvas. Fechar mesmo assim e perder o que foi editado?`);
      if (!seguir) return;
    }
    const restantes = abas.filter(a => a.caminho !== caminho);
    setAbas(restantes);
    if (abaAtiva === caminho) setAbaAtiva(restantes.length ? restantes[restantes.length - 1].caminho : null);
  };

  /**
   * Ctrl+S fora do editor.
   *
   * Dentro do CodeMirror o atalho já está no keymap dele (ver EditorDeCodigo). Este aqui cobre o
   * caso de o foco estar em outro lugar da aba — na árvore de arquivos, no terminal — onde a
   * pessoa ainda espera que Ctrl+S salve o que está aberto, e onde sem isto o navegador abriria
   * a caixa de "salvar página".
   */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
        evento.preventDefault();
        void salvarArquivo();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [salvarArquivo]);

  // ==========================================================================
  // Conferência (o "debugger"), terminal e preview
  // ==========================================================================

  const conferirProjeto = async () => {
    if (!projeto) return;
    setConferindo(true);
    setPainelInferior('problemas');
    const resposta = await chamarAgente('/check-project', { folder: projeto.caminho });
    setConferindo(false);
    if (resposta?.error) {
      onNotification(resposta.error, 'error');
      return;
    }
    const achados: Problema[] = resposta.problemas || [];
    setProblemas(achados);
    onNotification(
      achados.length === 0
        ? 'Conferência limpa: sem erro de sintaxe nem referência quebrada.'
        : `${achados.length} problema(s) encontrado(s) no projeto.`,
      achados.length === 0 ? 'success' : 'error'
    );
  };

  const abrirArquivoDoProblema = async (relativo: string) => {
    if (!projeto) return;
    const ehWindows = projeto.caminho.includes('\\');
    const completo = `${projeto.caminho.replace(/[\\/]+$/, '')}${ehWindows ? '\\' : '/'}${relativo.replace(/\//g, ehWindows ? '\\' : '/')}`;
    await abrirArquivo({ name: separarCaminho(completo).nome, path: completo, isDirectory: false, sizeBytes: null });
  };

  const rodarComando = async () => {
    if (!projeto || !comando.trim() || rodandoComando) return;
    const linha = comando.trim();
    setRodandoComando(true);
    // O comando roda NA PASTA DO PROJETO, e é essa a diferença que faz o terminal servir para
    // alguma coisa: "npm test" precisa rodar onde o package.json está, não na pasta pessoal.
    const resposta = await chamarAgente('/exec', { command: linha, cwd: projeto.caminho });
    setRodandoComando(false);
    setSaidas(prev => [...prev, {
      id: Math.random().toString(36).slice(2, 9),
      comando: linha,
      stdout: resposta?.stdout || '',
      stderr: resposta?.stderr || '',
      exitCode: Number(resposta?.exitCode ?? (resposta?.error ? 1 : 0)),
      erro: resposta?.error
    }]);
    setComando('');
  };

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [saidas]);

  const abrirPreview = async () => {
    if (!projeto) return;
    const resposta = await chamarAgente('/serve-folder', { folder: projeto.caminho });
    if (resposta?.error || !resposta?.url) {
      onNotification(resposta?.error || 'Não foi possível subir o servidor local para este projeto.', 'error');
      return;
    }
    setUrlDoPreview(resposta.url);
    window.open(resposta.url, '_blank', 'noopener,noreferrer');
    onNotification(`Projeto servido em ${resposta.url}`, 'success');
  };

  // ==========================================================================
  // Desenho
  // ==========================================================================

  const entradasVisiveis = (caminho: string): EntradaDoDisco[] => {
    const lista = arvore[caminho] || [];
    const filtradas = mostrarOcultos
      ? lista
      : lista.filter(e => !e.name.startsWith('.') && !RUIDO_DE_PROJETO.has(e.name));
    return [...filtradas].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  };

  const desenharArvore = (caminho: string, nivel: number): React.ReactNode => (
    entradasVisiveis(caminho).map(entrada => {
      const aberta = expandidas.has(entrada.path);
      const carregando = carregandoPastas.has(entrada.path);
      const ativa = abaAtiva === entrada.path;
      return (
        <div key={entrada.path}>
          <button
            onClick={() => (entrada.isDirectory ? alternarPasta(entrada.path) : abrirArquivo(entrada))}
            style={{ paddingLeft: `${8 + nivel * 14}px` }}
            className={cn(
              'w-full flex items-center gap-1.5 pr-2 py-[3px] rounded text-left text-[12px] transition-colors cursor-pointer',
              ativa ? 'bg-sky-500/15 text-sky-200' : 'text-her-ink/70 hover:bg-white/[0.04]'
            )}
            title={entrada.path}
          >
            {entrada.isDirectory ? (
              <>
                {carregando
                  ? <Loader2 size={12} className="shrink-0 animate-spin text-sky-400" />
                  : aberta
                    ? <ChevronDown size={12} className="shrink-0 text-her-muted" />
                    : <ChevronRight size={12} className="shrink-0 text-her-muted" />}
                {aberta
                  ? <FolderOpen size={13} className="shrink-0 text-sky-400" />
                  : <Folder size={13} className="shrink-0 text-sky-500/70" />}
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <FileCode size={13} className="shrink-0 text-her-muted" />
              </>
            )}
            <span className="truncate">{entrada.name}</span>
          </button>
          {entrada.isDirectory && aberta && desenharArvore(entrada.path, nivel + 1)}
        </div>
      );
    })
  );

  // ---- Sem agente conectado -------------------------------------------------
  if (!token.trim()) {
    return (
      <div className="w-full flex-1 flex flex-col items-center justify-center gap-5 p-10 text-center">
        <HardDrive size={40} className="text-sky-400/60" />
        <div className="space-y-2 max-w-md">
          <h2 className="text-xl font-light text-her-ink">OSONE IDE</h2>
          <p className="text-xs text-her-muted leading-relaxed">
            Para editar uma pasta do seu computador, o OSONE IDE fala com o Agente Local — o mesmo
            que já abre programas e arquivos para você. Ele só existe no OSONE rodando na sua
            máquina, e o token é gerado aqui mesmo, sem abrir arquivo nenhum.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={conectarAgente}
            className="px-5 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-[11px] uppercase tracking-widest font-bold transition-all cursor-pointer"
          >
            Conectar o Agente Local
          </button>
          <button onClick={onBack} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-her-muted text-[11px] uppercase tracking-widest transition-all cursor-pointer">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ---- Nenhum projeto vinculado --------------------------------------------
  if (!projeto) {
    return (
      <div className="w-full flex-1 flex flex-col min-h-0 p-6 sm:p-10 overflow-y-auto custom-scrollbar">
        <div className="w-full max-w-2xl mx-auto space-y-8">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-400"><HardDrive size={20} /></div>
              <div>
                <h2 className="text-lg font-light text-her-ink">OSONE IDE</h2>
                <p className="text-[10px] uppercase tracking-[0.2em] text-sky-400/70 font-mono">Plano Max • Edição local de verdade</p>
              </div>
            </div>
            <p className="text-xs text-her-muted leading-relaxed pt-2">
              Vincule uma pasta do computador e trabalhe nela como num VS Code: árvore de arquivos,
              editor com realce, salvamento direto no disco, conferência de erros e terminal na
              pasta certa. Depois de vinculada, o OSONE passa a saber o caminho — você pede a
              alteração por chat ou por voz e ela é aplicada nesse projeto, sem ele caçar pasta.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
            <span className="text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Vincular uma pasta</span>
            <button
              onClick={abrirNavegador}
              className="w-full py-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-[11px] uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderOpen size={15} />
              Procurar pasta no computador
            </button>
            <div className="flex items-center gap-2">
              <input
                value={caminhoManual}
                onChange={e => setCaminhoManual(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && caminhoManual.trim()) {
                    void abrirProjeto({ caminho: caminhoManual.trim(), nome: nomeDaPasta(caminhoManual.trim()), vinculadoEm: Date.now() });
                  }
                }}
                placeholder="…ou cole o caminho: ~/projetos/meu-site"
                className="flex-1 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-her-ink text-[11px] font-mono placeholder:text-her-muted/50 focus:outline-none focus:border-sky-500/40"
              />
              <button
                onClick={() => caminhoManual.trim() && abrirProjeto({ caminho: caminhoManual.trim(), nome: nomeDaPasta(caminhoManual.trim()), vinculadoEm: Date.now() })}
                disabled={!caminhoManual.trim()}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-her-ink text-[11px] uppercase tracking-widest transition-all cursor-pointer"
              >
                <Link2 size={14} />
              </button>
            </div>
          </div>

          {projetosSalvos.length > 0 && (
            <div className="space-y-3">
              <span className="text-[9px] uppercase tracking-[0.2em] text-her-muted font-bold">Projetos recentes</span>
              <div className="space-y-2">
                {projetosSalvos.map(p => (
                  <div key={p.caminho} className="flex items-center gap-2 group">
                    <button
                      onClick={() => abrirProjeto(p)}
                      className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] text-left transition-all cursor-pointer"
                    >
                      <Folder size={15} className="text-sky-500/70 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[12px] text-her-ink truncate">{p.nome}</div>
                        <div className="text-[10px] text-her-muted font-mono truncate">{p.caminho}</div>
                      </div>
                    </button>
                    <button
                      onClick={() => esquecerProjeto(p.caminho)}
                      title="Tirar da lista (não apaga nada do disco)"
                      className="p-2 rounded-lg text-her-muted/40 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={onBack} className="text-[11px] text-her-muted hover:text-her-ink transition-colors cursor-pointer flex items-center gap-2">
            <ArrowLeft size={13} /> Voltar ao início
          </button>
        </div>

        {navegadorAberto && (
          <NavegadorDePastas
            caminhoResolvido={caminhoResolvido}
            entradas={conteudoDoNavegador}
            navegando={navegando}
            erro={erroDoNavegador}
            onNavegar={navegarPara}
            onSubir={subirUmNivel}
            onFechar={() => setNavegadorAberto(false)}
            onVincular={() => {
              const alvo = caminhoResolvido || pastaDoNavegador;
              setNavegadorAberto(false);
              void abrirProjeto({ caminho: alvo, nome: nomeDaPasta(alvo), vinculadoEm: Date.now() });
            }}
          />
        )}
      </div>
    );
  }

  // ---- Projeto aberto: a IDE -----------------------------------------------
  return (
    <div className="w-full flex-1 flex flex-col min-h-0 bg-[#0a0b10]">
      {/* Barra do projeto */}
      <div className="shrink-0 h-11 px-3 flex items-center gap-2 bg-white/[0.02] border-b border-white/[0.06]">
        <button onClick={onBack} title="Voltar ao início" className="p-1.5 rounded-lg text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
          <ArrowLeft size={15} />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen size={14} className="text-sky-400 shrink-0" />
          <span className="text-[12px] text-her-ink font-medium truncate">{projeto.nome}</span>
          <span className="text-[10px] text-her-muted font-mono truncate hidden md:inline">{projeto.caminho}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={salvarArquivo}
            disabled={!sujo || salvando || !!arquivoAtivo?.truncado}
            title="Salvar no disco (Ctrl+S)"
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer',
              sujo && !arquivoAtivo?.truncado
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300'
                : 'bg-white/[0.03] text-her-muted/50 cursor-not-allowed'
            )}
          >
            {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar
          </button>
          <button onClick={conferirProjeto} title="Conferir sintaxe e referências do projeto"
            className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300 text-[10px] uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer">
            {conferindo ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
            Conferir
          </button>
          <button onClick={() => setPainelInferior(p => (p === 'terminal' ? null : 'terminal'))} title="Terminal na pasta do projeto"
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-her-ink/70 text-[10px] uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer">
            <TerminalIcon size={12} /> Terminal
          </button>
          <button onClick={abrirPreview} title="Servir a pasta num localhost e abrir no navegador"
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-her-ink/70 text-[10px] uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer">
            <Eye size={12} /> Preview
          </button>
          <button onClick={desvincular} title="Trocar de projeto"
            className="p-1.5 rounded-lg text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
            <Link2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Árvore */}
        <div className="w-60 shrink-0 flex flex-col min-h-0 bg-black/25 border-r border-white/[0.05]">
          <div className="shrink-0 h-8 px-2 flex items-center gap-1 border-b border-white/[0.04]">
            <span className="text-[9px] uppercase tracking-[0.15em] text-her-muted font-bold truncate">Explorador</span>
            <button onClick={recarregarArvore} title="Recarregar do disco" className="ml-auto p-1 rounded text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
              <RefreshCw size={11} />
            </button>
            <button
              onClick={() => setMostrarOcultos(v => !v)}
              title={mostrarOcultos ? 'Esconder node_modules, .git e afins' : 'Mostrar node_modules, .git e afins'}
              className={cn('p-1 rounded transition-all cursor-pointer', mostrarOcultos ? 'text-sky-300 bg-sky-500/15' : 'text-her-muted hover:text-her-ink hover:bg-white/5')}
            >
              <Eye size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar py-1.5">
            {desenharArvore(projeto.caminho, 0)}
          </div>
        </div>

        {/* Editor + painel inferior */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Abas */}
          {abas.length > 0 && (
            <div className="shrink-0 h-9 flex items-stretch overflow-x-auto custom-scrollbar bg-black/20 border-b border-white/[0.05]">
              {abas.map(aba => {
                const abaSuja = aba.conteudo !== aba.original;
                return (
                  <div
                    key={aba.caminho}
                    onClick={() => setAbaAtiva(aba.caminho)}
                    className={cn(
                      'group flex items-center gap-2 px-3 border-r border-white/[0.05] text-[11px] cursor-pointer transition-colors shrink-0',
                      abaAtiva === aba.caminho ? 'bg-[#0a0b10] text-her-ink' : 'text-her-muted hover:text-her-ink/80 hover:bg-white/[0.02]'
                    )}
                  >
                    <FileCode size={12} className="shrink-0 opacity-60" />
                    <span className="truncate max-w-[140px]">{aba.nome}</span>
                    {abaSuja && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Não salvo" />}
                    <button
                      onClick={e => { e.stopPropagation(); fecharAba(aba.caminho); }}
                      className="p-0.5 rounded text-her-muted/40 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Área de edição */}
          <div className="flex-1 flex flex-col min-h-0">
            {!arquivoAtivo ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                <FileCode size={30} className="text-her-muted/30" />
                <p className="text-[12px] text-her-muted max-w-sm leading-relaxed">
                  Escolha um arquivo na árvore à esquerda para abrir. O que você salvar aqui é
                  gravado direto em <span className="font-mono text-her-ink/70">{projeto.caminho}</span>.
                </p>
              </div>
            ) : (
              <>
                {arquivoAtivo.truncado && (
                  <div className="shrink-0 px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-[11px] text-amber-200">
                    <Lock size={12} className="shrink-0" />
                    <span>
                      Arquivo grande: aberto só em parte ({arquivoAtivo.totalDeLinhas} linhas no
                      total). Está <strong>somente leitura</strong> — salvar daqui apagaria o resto.
                      Use o chat do OSONE para editar trechos deste arquivo.
                    </span>
                  </div>
                )}
                {/*
                  A `key` é o que torna a troca de aba correta: sem ela, o CodeMirror seria
                  reaproveitado entre arquivos e levaria junto o histórico de desfazer do arquivo
                  anterior — um Ctrl+Z depois de trocar de aba desfaria edição de OUTRO arquivo.
                */}
                <EditorDeCodigo
                  key={arquivoAtivo.caminho}
                  valor={arquivoAtivo.conteudo}
                  nomeDoArquivo={arquivoAtivo.nome}
                  somenteLeitura={arquivoAtivo.truncado}
                  onChange={atualizarConteudo}
                  onSalvar={salvarArquivo}
                />
              </>
            )}
          </div>

          {/* Painel inferior: problemas ou terminal */}
          {painelInferior && (
            <div className="shrink-0 h-56 flex flex-col border-t border-white/[0.07] bg-black/35">
              <div className="shrink-0 h-8 px-2 flex items-center gap-1 border-b border-white/[0.05]">
                <button
                  onClick={() => setPainelInferior('problemas')}
                  className={cn('px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer',
                    painelInferior === 'problemas' ? 'bg-amber-500/15 text-amber-300' : 'text-her-muted hover:text-her-ink')}
                >
                  Problemas{problemas ? ` (${problemas.length})` : ''}
                </button>
                <button
                  onClick={() => setPainelInferior('terminal')}
                  className={cn('px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-bold transition-all cursor-pointer',
                    painelInferior === 'terminal' ? 'bg-sky-500/15 text-sky-300' : 'text-her-muted hover:text-her-ink')}
                >
                  Terminal
                </button>
                {urlDoPreview && (
                  <a href={urlDoPreview} target="_blank" rel="noopener noreferrer"
                    className="ml-2 text-[10px] font-mono text-emerald-300/80 hover:text-emerald-200 truncate">
                    {urlDoPreview}
                  </a>
                )}
                <button onClick={() => setPainelInferior(null)} className="ml-auto p-1 rounded text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
                  <X size={12} />
                </button>
              </div>

              {painelInferior === 'problemas' ? (
                <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-1">
                  {problemas === null ? (
                    <p className="text-[11px] text-her-muted p-2">
                      Clique em <strong>Conferir</strong> para checar sintaxe do JavaScript, presença
                      do index.html e referências locais quebradas. A conferência roda no seu
                      computador, sem modelo nenhum — é o Node dizendo se o arquivo é executável.
                    </p>
                  ) : problemas.length === 0 ? (
                    <div className="flex items-center gap-2 p-2 text-[11px] text-emerald-300">
                      <CheckCircle2 size={13} /> Nenhum problema encontrado nesta conferência.
                    </div>
                  ) : (
                    problemas.map((p, i) => (
                      <button
                        key={`${p.arquivo}-${i}`}
                        onClick={() => abrirArquivoDoProblema(p.arquivo)}
                        className="w-full flex items-start gap-2 p-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors cursor-pointer"
                      >
                        <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-[11px] text-amber-200 font-mono truncate">{p.arquivo}</div>
                          <div className="text-[11px] text-her-muted leading-relaxed">{p.problema}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <>
                  <div ref={terminalRef} className="flex-1 overflow-auto custom-scrollbar p-3 font-mono text-[11px] space-y-2">
                    {saidas.length === 0 && (
                      <p className="text-her-muted">
                        Comandos rodam em <span className="text-sky-300">{projeto.caminho}</span> — a
                        pasta do projeto, e não a pasta pessoal.
                      </p>
                    )}
                    {saidas.map(s => (
                      <div key={s.id} className="space-y-1">
                        <div className="text-sky-300">$ {s.comando}</div>
                        {s.erro && <div className="text-red-300 whitespace-pre-wrap">{s.erro}</div>}
                        {s.stdout && <div className="text-her-ink/80 whitespace-pre-wrap">{s.stdout}</div>}
                        {s.stderr && <div className="text-amber-300/90 whitespace-pre-wrap">{s.stderr}</div>}
                        {!s.erro && (
                          <div className={cn('text-[10px]', s.exitCode === 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
                            código de saída {s.exitCode}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="shrink-0 flex items-center gap-2 p-2 border-t border-white/[0.05]">
                    <span className="text-sky-400 font-mono text-[12px] pl-1">$</span>
                    <input
                      value={comando}
                      onChange={e => setComando(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void rodarComando(); }}
                      placeholder="npm install, npm test, git status…"
                      disabled={rodandoComando}
                      className="flex-1 bg-transparent text-her-ink font-mono text-[11px] placeholder:text-her-muted/40 focus:outline-none"
                    />
                    <button
                      onClick={rodarComando}
                      disabled={rodandoComando || !comando.trim()}
                      className="p-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 disabled:opacity-30 text-sky-300 transition-all cursor-pointer"
                    >
                      {rodandoComando ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {navegadorAberto && (
        <NavegadorDePastas
          caminhoResolvido={caminhoResolvido}
          entradas={conteudoDoNavegador}
          navegando={navegando}
          erro={erroDoNavegador}
          onNavegar={navegarPara}
          onSubir={subirUmNivel}
          onFechar={() => setNavegadorAberto(false)}
          onVincular={() => {
            const alvo = caminhoResolvido || pastaDoNavegador;
            setNavegadorAberto(false);
            void abrirProjeto({ caminho: alvo, nome: nomeDaPasta(alvo), vinculadoEm: Date.now() });
          }}
        />
      )}
    </div>
  );
};

/**
 * O "escolher pasta" que o navegador não tem.
 *
 * Um `<input type="file" webkitdirectory>` devolve CÓPIAS dos arquivos para dentro da aba, sem
 * caminho real e sem como gravar de volta — exatamente o oposto do que esta aba existe para
 * fazer. Então a navegação acontece do lado do Agente Local: cada passo é um `listar` de verdade
 * na pasta de verdade, e o que se vincula no fim é o caminho absoluto que o sistema devolveu.
 */
const NavegadorDePastas = ({
  caminhoResolvido, entradas, navegando, erro, onNavegar, onSubir, onFechar, onVincular
}: {
  caminhoResolvido: string;
  entradas: EntradaDoDisco[];
  navegando: boolean;
  erro: string;
  onNavegar: (destino: string) => void;
  onSubir: () => void;
  onFechar: () => void;
  onVincular: () => void;
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-xl max-h-[75vh] flex flex-col rounded-2xl bg-[#0d0e14] border border-white/10 shadow-2xl overflow-hidden"
    >
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <FolderOpen size={15} className="text-sky-400 shrink-0" />
        <span className="text-[12px] text-her-ink font-medium">Escolher a pasta do projeto</span>
        <button onClick={onFechar} className="ml-auto p-1 rounded text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
          <X size={14} />
        </button>
      </div>

      <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-b border-white/[0.04] bg-black/20">
        <button onClick={onSubir} title="Subir um nível" className="p-1.5 rounded-lg text-her-muted hover:text-her-ink hover:bg-white/5 transition-all cursor-pointer">
          <CornerLeftUp size={14} />
        </button>
        <span className="text-[11px] font-mono text-sky-300/80 truncate flex-1">{caminhoResolvido || '…'}</span>
        {navegando && <Loader2 size={13} className="animate-spin text-sky-400 shrink-0" />}
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-2">
        {erro && <div className="p-3 text-[11px] text-red-300">{erro}</div>}
        {entradas.filter(e => e.isDirectory).length === 0 && !erro && !navegando && (
          <p className="p-3 text-[11px] text-her-muted">Nenhuma subpasta aqui. Você pode vincular esta pasta mesmo assim.</p>
        )}
        {entradas.filter(e => e.isDirectory).map(entrada => (
          <button
            key={entrada.path}
            onDoubleClick={() => onNavegar(entrada.path)}
            onClick={() => onNavegar(entrada.path)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-[12px] text-her-ink/80 hover:bg-white/[0.05] transition-colors cursor-pointer"
          >
            <Folder size={14} className="text-sky-500/70 shrink-0" />
            <span className="truncate">{entrada.name}</span>
            <ChevronRight size={13} className="ml-auto text-her-muted/40 shrink-0" />
          </button>
        ))}
      </div>

      <div className="shrink-0 p-3 border-t border-white/[0.06] flex items-center gap-2">
        <button onClick={onFechar} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-her-muted text-[11px] uppercase tracking-widest transition-all cursor-pointer">
          Cancelar
        </button>
        <button
          onClick={onVincular}
          disabled={!caminhoResolvido}
          className="flex-1 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 disabled:opacity-40 text-sky-200 text-[11px] uppercase tracking-widest font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <Link2 size={14} />
          Vincular esta pasta
        </button>
      </div>
    </motion.div>
  </div>
);
