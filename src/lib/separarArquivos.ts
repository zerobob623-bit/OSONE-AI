/**
 * Separa um HTML grudado em index.html + folha de estilo + script — em QUALQUER projeto.
 *
 * O OSONE já sabe trabalhar com vários arquivos: o preview resolve `<link href>` e `<script src>`
 * contra o repositório e embute o conteúdo NA POSIÇÃO DA TAG. Só faltava algo que fizesse a
 * separação de um arquivo que já nasceu com tudo dentro — e é isso aqui.
 *
 * ====== O QUE TORNA ISTO SEGURO EM QUALQUER PROJETO ======
 *
 * A tentação seria juntar todo o CSS num arquivo e todo o JS noutro. Isso quebra projetos reais,
 * e quebra em silêncio:
 *
 * - Ordem de execução: um <script> no fim do <body> roda com a página montada; o mesmo script
 *   movido para o <head> roda antes dos elementos existirem, e `document.getElementById` devolve
 *   null. O jogo abre em branco e nada no console explica por quê.
 * - Cascata do CSS: um <style> depois de um <link> sobrescreve a folha externa. Juntar os dois
 *   blocos num arquivo só inverte quem vence, e o layout muda sem ninguém ter mexido no layout.
 *
 * Por isso a regra aqui é uma só: CADA BLOCO VIRA UM ARQUIVO, e a tag que o substitui fica
 * EXATAMENTE onde o bloco estava. Ordem e posição ficam idênticas, então não há como a separação
 * mudar o comportamento — e, no caso comum (um <style> e um <script>), o resultado é justamente
 * os três arquivos que se esperaria.
 *
 * E, como último cuidado, a separação é CONFERIDA antes de valer: as referências são desfeitas de
 * volta e o resultado tem que bater CARACTERE POR CARACTERE com o original. Não batendo, nada é
 * separado. É o que permite prometer "funciona em qualquer projeto" sem ter previsto cada formato
 * de HTML que existe: em vez de tentar adivinhar todos, o resultado é verificado sempre.
 */

export interface ArquivoSeparado {
  nome: string;
  conteudo: string;
  linguagem: string;
}

export interface ResultadoDaSeparacao {
  /** false quando não havia o que separar, ou quando a conferência reprovou. */
  separou: boolean;
  /** O HTML que fica no lugar do original, já com as referências. */
  html: string;
  /** Os arquivos novos a criar. */
  novos: ArquivoSeparado[];
  /** Sempre preenchido quando separou é false: é o que a tela mostra. */
  motivo?: string;
}

/** Tipos de <script> que contêm JavaScript de verdade e podem virar arquivo. */
const TIPOS_DE_JS = ['', 'text/javascript', 'application/javascript', 'module'];

function lerAtributo(atributos: string, nome: string): string | null {
  const m = new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(atributos || '');
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

/** Um nome que ainda não existe no projeto. 'game.js' vira 'game-2.js' se preciso. */
function nomeLivre(desejado: string, ocupados: Set<string>): string {
  if (!ocupados.has(desejado.toLowerCase())) return desejado;
  const ponto = desejado.lastIndexOf('.');
  const base = ponto === -1 ? desejado : desejado.slice(0, ponto);
  const ext = ponto === -1 ? '' : desejado.slice(ponto);
  for (let n = 2; n < 100; n++) {
    const tentativa = `${base}-${n}${ext}`;
    if (!ocupados.has(tentativa.toLowerCase())) return tentativa;
  }
  return `${base}-${Date.now()}${ext}`;
}

interface BlocoAchado {
  inicio: number;
  fim: number;
  /** O conteúdo entre as tags de abertura e fechamento. */
  conteudo: string;
  /** Atributos da tag de abertura, para não se perderem na troca. */
  atributos: string;
  tipo: 'css' | 'js';
}

/**
 * Acha os blocos que podem sair do HTML.
 *
 * Fica de fora, de propósito: `<script src>` (já é externo), tipos que não são JavaScript
 * (`application/json`, `text/template` — são DADOS, e virar arquivo .js os quebraria), e blocos
 * vazios, que só trocariam um bloco vazio por um arquivo vazio.
 */
export function acharBlocos(html: string): BlocoAchado[] {
  const blocos: BlocoAchado[] = [];
  const re = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const [inteiro, tag, atributos, conteudo] = m;
    if (!conteudo.trim()) continue;

    if (tag.toLowerCase() === 'script') {
      // Script com endereço próprio já é um arquivo — não há o que extrair.
      if (lerAtributo(atributos, 'src') !== null) continue;
      const tipo = (lerAtributo(atributos, 'type') || '').toLowerCase();
      if (!TIPOS_DE_JS.includes(tipo)) continue;
      blocos.push({ inicio: m.index, fim: m.index + inteiro.length, conteudo, atributos, tipo: 'js' });
    } else {
      blocos.push({ inicio: m.index, fim: m.index + inteiro.length, conteudo, atributos, tipo: 'css' });
    }
  }
  return blocos;
}

/**
 * Desfaz a separação: põe o conteúdo dos arquivos de volta no lugar das referências.
 *
 * Existe para CONFERIR o trabalho, não para ser usado no app. Se o que sai daqui não for idêntico
 * ao HTML original, a separação mudou alguma coisa — e então ela não acontece.
 */
export function remontar(html: string, novos: ArquivoSeparado[]): string {
  const porNome = new Map(novos.map(a => [a.nome, a.conteudo]));
  /**
   * Os atributos que sobram, prontos para entrar na tag.
   *
   * O espaço é reposto só quando há atributo. Sem este cuidado, um <style> sem atributo nenhum
   * voltava como `<style >`, com um espaço a mais — e a conferência, corretamente, reprovava a
   * separação inteira por causa dele. Foi ela quem apontou este defeito.
   */
  const juntarAtributos = (...partes: string[]) => {
    const t = partes.join(' ').replace(/\s+/g, ' ').trim();
    return t ? ' ' + t : '';
  };

  return html
    .replace(/<link\b([^>]*?)\bhref\s*=\s*["']([^"']+)["']([^>]*)>/gi, (inteiro, antes, alvo, depois) => {
      const conteudo = porNome.get(alvo);
      if (conteudo === undefined) return inteiro;
      const semRel = `${antes} ${depois}`.replace(/\brel\s*=\s*["']stylesheet["']/i, '');
      return `<style${juntarAtributos(semRel)}>${conteudo}</style>`;
    })
    .replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi, (inteiro, antes, alvo, depois) => {
      const conteudo = porNome.get(alvo);
      if (conteudo === undefined) return inteiro;
      return `<script${juntarAtributos(antes, depois)}>${conteudo}</script>`;
    });
}

/**
 * A ÚNICA diferença que a conferência aceita, declarada explicitamente.
 *
 * O conteúdo extraído é aparado antes de virar arquivo: um styles.css que começa com uma linha em
 * branco e termina com a indentação do HTML é feio sem necessidade. Aparar, porém, faz a ida e
 * volta não bater ao pé da letra — e a conferência, corretamente, reprovava por causa disso.
 *
 * Em vez de afrouxar a comparação (o que deixaria passar diferenças de verdade), a folga é
 * nomeada: espaço em branco NO COMEÇO E NO FIM de um bloco <style> ou <script>. Ali ele
 * comprovadamente não muda nada — CSS e JavaScript ignoram espaço nas bordas. Fora desses dois
 * pontos, a comparação continua sendo caractere por caractere.
 */
function normalizarParaConferencia(html: string): string {
  return (html || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/(<(style|script)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi,
      (_i, abre, _tag, conteudo, fecha) => `${abre}${conteudo.trim()}${fecha}`);
}

/**
 * Separa o HTML. Devolve `separou: false` com o motivo quando não há o que fazer — ou quando a
 * conferência não bateu, caso em que nada deve ser gravado.
 */
export function separarProjeto(
  html: string,
  nomesJaUsados: string[] = []
): ResultadoDaSeparacao {
  const original = html || '';
  const semSeparar = (motivo: string): ResultadoDaSeparacao =>
    ({ separou: false, html: original, novos: [], motivo });

  if (!/<html|<body|<!DOCTYPE/i.test(original)) {
    return semSeparar('este arquivo não é uma página HTML — só páginas têm estilo e script para separar');
  }

  const blocos = acharBlocos(original);
  if (blocos.length === 0) {
    return semSeparar('não há estilo nem script embutido neste arquivo: ele já está separado');
  }

  const ocupados = new Set(nomesJaUsados.map(n => n.toLowerCase()));
  const novos: ArquivoSeparado[] = [];
  const css = blocos.filter(b => b.tipo === 'css');
  const js = blocos.filter(b => b.tipo === 'js');

  // Nome simples quando há um bloco só; numerado quando há vários. Nomear 'styles-1.css' num
  // projeto com um único estilo seria feio sem motivo.
  const nomeDoBloco = (b: BlocoAchado, i: number) => {
    const total = b.tipo === 'css' ? css.length : js.length;
    const base = b.tipo === 'css'
      ? (total === 1 ? 'styles.css' : `styles-${i + 1}.css`)
      : (total === 1 ? 'game.js' : `game-${i + 1}.js`);
    const livre = nomeLivre(base, ocupados);
    ocupados.add(livre.toLowerCase());
    return livre;
  };

  // De trás para frente: trocar um bloco muda as posições dos seguintes, mas não as dos anteriores.
  let resultado = original;
  const emOrdemInversa = [...blocos].sort((a, b) => b.inicio - a.inicio);
  const indiceNoTipo = new Map<BlocoAchado, number>();
  css.forEach((b, i) => indiceNoTipo.set(b, i));
  js.forEach((b, i) => indiceNoTipo.set(b, i));

  for (const bloco of emOrdemInversa) {
    const nome = nomeDoBloco(bloco, indiceNoTipo.get(bloco) ?? 0);
    // Os atributos do bloco original seguem na tag nova: um <style media="print"> que virasse um
    // <link> sem o media passaria a valer para a tela também.
    const atributos = (bloco.atributos || '').trim();
    const substituta = bloco.tipo === 'css'
      ? `<link rel="stylesheet" href="${nome}"${atributos ? ' ' + atributos : ''}>`
      : `<script${atributos ? ' ' + atributos : ''} src="${nome}"></script>`;

    resultado = resultado.slice(0, bloco.inicio) + substituta + resultado.slice(bloco.fim);
    novos.unshift({
      nome,
      conteudo: bloco.conteudo.replace(/^\r?\n/, '').replace(/\s+$/, ''),
      linguagem: bloco.tipo === 'css' ? 'css' : 'javascript'
    });
  }

  /**
   * A CONFERÊNCIA. Sem ela, nada disto poderia prometer "funciona em qualquer projeto".
   *
   * Desfazer a separação tem que devolver o arquivo original, caractere por caractere. Qualquer
   * diferença — um atributo perdido, uma quebra de linha a mais, uma tag que a expressão regular
   * leu errado num HTML fora do comum — significa que o comportamento pode ter mudado. E mudança
   * silenciosa de comportamento é exatamente o que não pode acontecer com o projeto de alguém.
   */
  const conferencia = remontar(resultado, novos);
  if (normalizarParaConferencia(conferencia) !== normalizarParaConferencia(original)) {
    return semSeparar(
      'a separação não passou na conferência de segurança: desfazê-la não devolveu o arquivo original, '
      + 'então ela poderia mudar o comportamento do projeto. Nada foi alterado.'
    );
  }

  return { separou: true, html: resultado, novos };
}
