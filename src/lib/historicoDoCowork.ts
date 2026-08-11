import type { MotivoDeParadaDoAgente, RelatorioDoAgente, VoltaDoAgente } from './agenteAutonomo';

/**
 * As tarefas que o COWORK já executou, para repetir com um clique.
 *
 * O que é guardado aqui mudou junto com o agente, e a mudança importa. Antes o histórico guardava
 * a LISTA DE PASSOS, porque o plano era escrito uma vez e executado; repetir era reexecutar os
 * mesmos passos. Só que passos gravados envelhecem: o botão mudou de lugar, a página ganhou um
 * aviso de cookies, o site foi redesenhado — e repetir passos velhos numa tela nova é justamente
 * o jeito de errar com confiança.
 *
 * Agora o que se guarda é o OBJETIVO em português. Repetir é pedir a mesma coisa de novo, e o
 * agente decide o caminho olhando a tela de hoje. O que era caro guardar (o plano) deixou de
 * existir; o que valia a pena guardar (o que você quis) é uma linha de texto.
 */

export interface TarefaDoHistorico {
  id: string;
  /** O objetivo, escrito pelo usuário. É isto que "repetir" reenvia. */
  tarefa: string;
  quando: number;
  desfecho: 'concluida' | 'parada' | 'erro';
  /** O resultado em português — inclusive a resposta, quando a tarefa era descobrir algo. */
  detalhe?: string;
  /** Quantas ações o agente precisou. Serve para reconhecer tarefa que ficou cara. */
  voltas?: number;
  /** Em que janela começou, para a pessoa lembrar do contexto. */
  janela?: string;
  /** Houve uma execução concluída cujos alvos semânticos podem orientar a próxima tentativa. */
  aprendida?: boolean;
}

const CHAVE_DO_HISTORICO = 'osone_cowork_historico';
const MAXIMO_NO_HISTORICO = 20;
const CHAVE_DAS_AUTOMACOES = 'osone_cowork_automacoes_v1';

export interface MemoriaDeAutomacao {
  objetivo: string;
  atualizadoEm: number;
  sucessos: number;
  origem?: 'execucao' | 'ensinamento' | 'skill';
  treinamentoId?: string;
  /** Pistas sem coordenadas e sem o conteúdo digitado. Nunca são reproduzidas às cegas. */
  pistas: Array<{ acao: string; descricao: string }>;
}

const normalizarObjetivo = (texto: string) => texto.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');

const PALAVRAS_VAZIAS = new Set(['a', 'ao', 'as', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'me', 'meu', 'minha', 'no', 'na', 'o', 'os', 'para', 'por', 'um', 'uma']);
const normalizarPalavraDoObjetivo = (palavra: string) => {
  if (palavra === 'short' || palavra === 'shorts') return 'curto';
  if (palavra === 'video' || palavra === 'videos') return 'video';
  return palavra;
};
const palavrasDoObjetivo = (texto: string) => new Set(normalizarObjetivo(texto)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/)
  .filter(p => p.length > 1 && !PALAVRAS_VAZIAS.has(p))
  .map(normalizarPalavraDoObjetivo));

/** Permite reencontrar “ver meu último short” quando o ensino se chamava “olhar vídeo curto”. */
export function semelhancaDeObjetivos(a: string, b: string): number {
  const aa = palavrasDoObjetivo(a);
  const bb = palavrasDoObjetivo(b);
  if (!aa.size || !bb.size) return normalizarObjetivo(a) === normalizarObjetivo(b) ? 1 : 0;
  let comuns = 0;
  aa.forEach(p => { if (bb.has(p)) comuns++; });
  return comuns / Math.max(aa.size, bb.size);
}

function lerAutomacoes(): MemoriaDeAutomacao[] {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE_DAS_AUTOMACOES) || '[]');
    return Array.isArray(valor) ? valor : [];
  } catch { return []; }
}

/**
 * Converte uma execução bem-sucedida em memória SEM transformar o COWORK num macro gravado.
 * Coordenadas e textos digitados são descartados; senha, token ou mensagem do usuário não entram
 * no armazenamento. Na próxima vez, o modelo recebe só descrições como “clicou no botão Enviar”
 * e continua obrigado a olhar a tela atual antes de cada ação.
 */
function pistaSegura(volta: VoltaDoAgente): { acao: string; descricao: string } | null {
  if (!volta.ok) return null;
  const args = volta.args || {};
  switch (volta.acao) {
    case 'clicar': {
      const alvo = String(args.alvo || '').trim();
      return alvo ? { acao: 'clicar', descricao: `clicar em ${alvo}` } : null;
    }
    case 'clique_direito': {
      const alvo = String(args.alvo || '').trim();
      return alvo ? { acao: 'clique_direito', descricao: `abrir menu contextual de ${alvo}` } : null;
    }
    case 'abrir': {
      let caminho = String(args.caminho || '').trim();
      try {
        const url = new URL(caminho);
        url.search = ''; url.hash = '';
        caminho = url.toString();
      } catch { /* caminho local fica local; esta memória nunca sai do aparelho */ }
      return caminho ? { acao: 'abrir', descricao: `abrir ${caminho}` } : null;
    }
    case 'trocar_janela': {
      const titulo = String(args.tituloContem || '').trim();
      return titulo ? { acao: 'trocar_janela', descricao: `procurar janela ${titulo}` } : null;
    }
    case 'tecla': {
      const tecla = String(args.tecla || '').trim();
      return tecla ? { acao: 'tecla', descricao: `pressionar ${tecla}` } : null;
    }
    case 'rolar':
      return { acao: 'rolar', descricao: `rolar ${String(args.direcao || 'down')}` };
    case 'digitar':
      return { acao: 'digitar', descricao: 'digitar no campo em foco (conteúdo omitido por privacidade)' };
    /**
     * PESQUISA TAMBÉM É CAMINHO, E TAMBÉM SE APRENDE.
     *
     * Sem estes dois casos, o "default: null" abaixo descartava tudo: uma pesquisa concluída com
     * sucesso não deixava pista nenhuma, e a mesma pergunta na semana seguinte recomeçava do zero,
     * redescobrindo as mesmas páginas. Justamente o tipo de tarefa que mais se repete.
     *
     * O que se guarda é o CAMINHO (a consulta que funcionou, o endereço que tinha a resposta), e
     * não o resultado: preço muda, notícia muda, e uma memória que devolvesse o número velho seria
     * pior que memória nenhuma. Da próxima vez ele vai direto à fonte certa e lê o valor de agora.
     */
    case 'procurar': {
      const consulta = String(args.consulta || '').trim();
      return consulta ? { acao: 'procurar', descricao: `pesquisar por "${consulta}"` } : null;
    }
    case 'ler_pagina': {
      let endereco = String(args.url || '').trim();
      try {
        // Mesmo cuidado do "abrir": a parte depois de "?" costuma carregar sessão e identificador,
        // e esta memória fica no aparelho, mas guardar segredo que não serve para nada é dívida.
        const url = new URL(endereco);
        url.search = ''; url.hash = '';
        endereco = url.toString();
      } catch { /* endereço estranho não vira pista */ }
      return endereco ? { acao: 'ler_pagina', descricao: `ler ${endereco}` } : null;
    }
    default:
      return null;
  }
}

export function aprenderAutomacao(objetivo: string, relatorio: RelatorioDoAgente): boolean {
  if (relatorio.motivo !== 'concluido') return false;
  const pistas = relatorio.voltas.map(pistaSegura).filter(Boolean).slice(0, 24) as MemoriaDeAutomacao['pistas'];
  if (!pistas.length) return false;
  const chave = normalizarObjetivo(objetivo);
  const atuais = lerAutomacoes();
  const anterior = atuais.find(a => normalizarObjetivo(a.objetivo) === chave);
  const memoria: MemoriaDeAutomacao = {
    objetivo: objetivo.trim(), atualizadoEm: Date.now(), sucessos: (anterior?.sucessos || 0) + 1,
    origem: anterior?.origem || 'execucao', treinamentoId: anterior?.treinamentoId,
    // Uma execução futura confirma que o ensino funciona, mas não deve apagar “quando usar” e
    // “como confirmar”, que são mais ricos do que o relatório resumido de cliques.
    pistas: anterior?.origem === 'ensinamento' ? anterior.pistas : pistas
  };
  const nova = [memoria, ...atuais.filter(a => normalizarObjetivo(a.objetivo) !== chave)].slice(0, 20);
  try { localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(nova)); } catch { return false; }
  return true;
}

export function guardarAutomacaoEnsinada(opcoes: {
  objetivo: string;
  treinamentoId: string;
  passos: Array<{ acao: string; alvo: string; quandoUsar: string; comoConfirmar: string }>;
}): boolean {
  const pistas = opcoes.passos.map(p => ({
    acao: p.acao || 'ensinado',
    descricao: [
      p.acao && `${p.acao}${p.alvo ? ` em ${p.alvo}` : ''}`,
      p.quandoUsar && `quando vir: ${p.quandoUsar}`,
      p.comoConfirmar && `confirme depois: ${p.comoConfirmar}`
    ].filter(Boolean).join(' — ')
  })).filter(p => p.descricao).slice(0, 24);
  if (!pistas.length) return false;
  const chave = normalizarObjetivo(opcoes.objetivo);
  const atuais = lerAutomacoes();
  const memoria: MemoriaDeAutomacao = {
    objetivo: opcoes.objetivo.trim(), atualizadoEm: Date.now(), sucessos: 1,
    origem: 'ensinamento', treinamentoId: opcoes.treinamentoId, pistas
  };
  const nova = [memoria, ...atuais.filter(a => normalizarObjetivo(a.objetivo) !== chave)].slice(0, 20);
  try { localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(nova)); } catch { return false; }
  return true;
}

const limparCercaDaSkill = (texto: string) => texto.trim()
  .replace(/^```(?:json|md|markdown|txt)?\s*/i, '').replace(/\s*```$/, '').trim();

const limparLinhaDaSkill = (texto: string): string => {
  let t = String(texto || '').trim()
    .replace(/^\s*(?:[-*•]|\d+[.)]|passo\s+\d+\s*[:.)-]?)\s*/i, '')
    .replace(/\b(?:x|left)\s*[:=]\s*-?\d+(?:\.\d+)?\b/gi, '')
    .replace(/\b(?:y|top)\s*[:=]\s*-?\d+(?:\.\d+)?\b/gi, '')
    .replace(/\(\s*-?\d{1,5}\s*,\s*-?\d{1,5}\s*\)/g, '')
    .replace(/\b-?\d{1,5}\s*,\s*-?\d{1,5}\b/g, '')
    .replace(/\b\d+(?:\.\d+)?px\b/gi, '')
    .replace(/\b(sk-[a-z0-9_-]{8,}|whsec_[a-z0-9_-]{8,}|AIza[a-z0-9_-]{8,})\b/gi, '[segredo omitido]')
    .replace(/\b(senha|password|token|chave|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[omitido]')
    .replace(/\s+/g, ' ')
    .trim();
  try {
    const url = new URL(t);
    url.search = ''; url.hash = '';
    t = url.toString();
  } catch { /* não era uma URL isolada */ }
  return t;
};

const acaoProvavelDaSkill = (linha: string): string => {
  const t = linha.toLocaleLowerCase('pt-BR');
  if (/\b(clique direito|bot[aã]o direito|menu contextual)\b/.test(t)) return 'clique_direito';
  if (/\b(clicar|clique|toque|selecionar|selecione|bot[aã]o|menu|tr[eê]s pontos|download|baixar|salvar)\b/.test(t)) return 'clicar';
  if (/\b(abrir|abra|acesse|entrar em|v[aá] para|navegue)\b/.test(t)) return 'abrir';
  if (/\b(digitar|digite|escrever|escreva|preencher|preencha|colar|cole)\b/.test(t)) return 'digitar';
  if (/\b(rolar|role|scroll|descer|subir)\b/.test(t)) return 'rolar';
  if (/\b(enter|tab|escape|esc|ctrl|atalho|pressionar|pressione)\b/.test(t)) return 'tecla';
  if (/\b(aguardar|aguarde|esperar|espere|carregar)\b/.test(t)) return 'esperar';
  return 'seguir';
};

function passosDeJsonDaSkill(conteudo: string): Array<{ acao: string; alvo: string; quandoUsar: string; comoConfirmar: string }> {
  try {
    const bruto = JSON.parse(limparCercaDaSkill(conteudo));
    const lista = Array.isArray(bruto) ? bruto : (Array.isArray(bruto?.passos) ? bruto.passos : (Array.isArray(bruto?.steps) ? bruto.steps : []));
    return lista.map((p: any) => {
      if (typeof p === 'string') {
        const alvo = limparLinhaDaSkill(p);
        return { acao: acaoProvavelDaSkill(alvo), alvo, quandoUsar: '', comoConfirmar: '' };
      }
      const alvo = limparLinhaDaSkill(p?.alvo ?? p?.target ?? p?.descricao ?? p?.description ?? p?.texto ?? '');
      const quandoUsar = limparLinhaDaSkill(p?.quandoUsar ?? p?.when ?? p?.contexto ?? p?.context ?? '');
      const comoConfirmar = limparLinhaDaSkill(p?.comoConfirmar ?? p?.confirm ?? p?.resultado ?? p?.success ?? '');
      const acao = limparLinhaDaSkill(p?.acao ?? p?.action ?? p?.tipo ?? '') || acaoProvavelDaSkill(`${alvo} ${quandoUsar}`);
      return { acao, alvo, quandoUsar, comoConfirmar };
    }).filter(p => p.alvo || p.quandoUsar || p.comoConfirmar).slice(0, 24);
  } catch {
    return [];
  }
}

export function passosDaSkillTextualDoCowork(conteudo: string): Array<{ acao: string; alvo: string; quandoUsar: string; comoConfirmar: string }> {
  const porJson = passosDeJsonDaSkill(conteudo);
  if (porJson.length) return porJson;

  const linhas = limparCercaDaSkill(conteudo)
    .split(/\r?\n+/)
    .map(limparLinhaDaSkill)
    .filter(l => l.length >= 4 && !/^#+\s*$/.test(l))
    .slice(0, 24);

  const base = linhas.length ? linhas : limparLinhaDaSkill(conteudo)
    .split(/(?<=[.!?])\s+/)
    .map(limparLinhaDaSkill)
    .filter(l => l.length >= 8)
    .slice(0, 24);

  return base.map(linha => ({
    acao: acaoProvavelDaSkill(linha),
    alvo: linha.length > 180 ? `${linha.slice(0, 177)}...` : linha,
    quandoUsar: '',
    comoConfirmar: ''
  }));
}

export function guardarSkillTextualDoCowork(opcoes: {
  objetivo: string;
  skillId: string;
  conteudo: string;
  nome?: string;
}): boolean {
  const passos = passosDaSkillTextualDoCowork(opcoes.conteudo);
  const pistas = passos.map(p => ({
    acao: p.acao || 'skill',
    descricao: [
      opcoes.nome && `skill "${limparLinhaDaSkill(opcoes.nome)}"`,
      `${p.acao || 'seguir'}${p.alvo ? `: ${p.alvo}` : ''}`,
      p.quandoUsar && `quando vir: ${p.quandoUsar}`,
      p.comoConfirmar && `confirme depois: ${p.comoConfirmar}`
    ].filter(Boolean).join(' — ')
  })).filter(p => p.descricao).slice(0, 24);
  if (!pistas.length) return false;
  const chave = normalizarObjetivo(opcoes.objetivo);
  const atuais = lerAutomacoes();
  const memoria: MemoriaDeAutomacao = {
    objetivo: opcoes.objetivo.trim(), atualizadoEm: Date.now(), sucessos: 1,
    origem: 'skill', treinamentoId: opcoes.skillId, pistas
  };
  const nova = [memoria, ...atuais.filter(a => normalizarObjetivo(a.objetivo) !== chave)].slice(0, 20);
  try { localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(nova)); } catch { return false; }
  return true;
}

export function apagarAutomacaoEnsinada(treinamentoId: string): void {
  try {
    const nova = lerAutomacoes().filter(a => a.treinamentoId !== treinamentoId);
    localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(nova));
  } catch { /* apagar conforto não pode derrubar a aba */ }
}

export function pistasDaAutomacao(objetivo: string): string {
  const chave = normalizarObjetivo(objetivo);
  const memorias = lerAutomacoes();
  const memoria = memorias.find(a => normalizarObjetivo(a.objetivo) === chave)
    || memorias.map(a => ({ a, nota: semelhancaDeObjetivos(objetivo, a.objetivo) }))
      .filter(x => x.nota >= 0.5).sort((x, y) => y.nota - x.nota)[0]?.a;
  if (!memoria?.pistas?.length) return '';
  return [
    memoria.origem === 'ensinamento'
      ? `PROCEDIMENTO ENSINADO PELA PESSOA PARA "${memoria.objetivo}":`
      : memoria.origem === 'skill'
        ? `SKILL IMPORTADA PELA PESSOA PARA "${memoria.objetivo}":`
        : `MEMÓRIA DE UMA EXECUÇÃO BEM-SUCEDIDA DESTE OBJETIVO (${memoria.sucessos} vez(es)):`,
    ...memoria.pistas.map((p, i) => `${i + 1}. ${p.descricao}`),
    'Priorize este caminho. Mesmo assim, NÃO repita coordenadas nem ações cegamente: confira a foto ATUAL, adapte o alvo e valide o resultado de cada passo.'
  ].join('\n');
}

/** Traduz o motivo de parada do agente para o desfecho que a lista mostra. */
export function desfechoDoMotivo(motivo: MotivoDeParadaDoAgente | string): TarefaDoHistorico['desfecho'] {
  if (motivo === 'concluido') return 'concluida';
  if (motivo === 'parado-pelo-usuario') return 'parada';
  return 'erro';
}

export function lerHistorico(): TarefaDoHistorico[] {
  try {
    const salvo = localStorage.getItem(CHAVE_DO_HISTORICO);
    const lista = salvo ? JSON.parse(salvo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export function guardarNoHistorico(item: TarefaDoHistorico): TarefaDoHistorico[] {
  const atual = lerHistorico();
  // A mesma tarefa executada de novo sobe para o topo em vez de virar uma segunda linha igual.
  const semRepetida = atual.filter(t => t.tarefa.trim().toLowerCase() !== item.tarefa.trim().toLowerCase());
  const nova = [item, ...semRepetida].slice(0, MAXIMO_NO_HISTORICO);
  try {
    localStorage.setItem(CHAVE_DO_HISTORICO, JSON.stringify(nova));
  } catch { /* histórico é conforto, não pode quebrar a execução */ }
  return nova;
}

export function limparHistorico(): void {
  try {
    localStorage.removeItem(CHAVE_DO_HISTORICO);
    // Aprendizado inferido de execuções acompanha o histórico. Ensino demonstrado e skill
    // importada são conhecimento manual da pessoa; só saem pelo botão de apagar daquele card.
    const manuais = lerAutomacoes().filter(a => a.origem === 'ensinamento' || a.origem === 'skill');
    if (manuais.length) localStorage.setItem(CHAVE_DAS_AUTOMACOES, JSON.stringify(manuais));
    else localStorage.removeItem(CHAVE_DAS_AUTOMACOES);
  } catch { /* idem */ }
}
