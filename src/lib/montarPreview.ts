import { CodeRepositoryFile } from '../types';

/**
 * MONTA A PÁGINA DO PREVIEW A PARTIR DO PROJETO INTEIRO.
 *
 * Antes o preview recebia só o conteúdo do arquivo aberto, e isso tornava os outros arquivos
 * decoração: o projeto vinha com styles.css e script.js que nenhuma parte do sistema carregava,
 * então editá-los não mudava um pixel. E abrir o styles.css jogava CSS cru dentro de um documento
 * HTML, que o navegador desenhava como texto solto — um resultado que parecia defeito do código
 * do usuário.
 *
 * São duas coisas, e as duas importam:
 *
 * 1. As referências do HTML são resolvidas contra os arquivos do próprio projeto. Um
 *    <link href="styles.css"> vira o CSS embutido, um <script src="script.js"> vira o script
 *    embutido. Endereços externos (CDN) ficam como estão — eles são carregados pela internet.
 * 2. Editando um arquivo que não é página (CSS, JS), o preview mostra a PÁGINA do projeto, e não
 *    o arquivo aberto. É o único jeito de ver o efeito de mexer no CSS.
 */

/** O nome do arquivo dentro de um caminho, sem pasta, sem query e sem âncora. */
function nomeDoCaminho(caminho: string): string {
  return (caminho || '')
    .split(/[?#]/)[0]
    .split('/')
    .filter(Boolean)
    .pop() || '';
}

function ehEndereçoExterno(caminho: string): boolean {
  return /^(https?:)?\/\//i.test(caminho) || /^data:/i.test(caminho);
}

/**
 * Neutraliza a sequência que fecharia a tag cedo demais.
 *
 * Um script do projeto que contenha a string de fechamento — comum em código que gera HTML —
 * encerraria a tag no meio ao ser embutido, e o resto do arquivo apareceria como texto na tela.
 */
function protegerFechamento(conteudo: string, tag: 'script' | 'style'): string {
  return (conteudo || '').replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1');
}

const RE_LINK_CSS = /<link\b[^>]*>/gi;
const RE_SCRIPT_SRC = /<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi;

/** A página do projeto: a marcada como principal, senão index.html, senão o primeiro HTML. */
export function paginaPrincipal(arquivos: CodeRepositoryFile[]): CodeRepositoryFile | null {
  const html = (arquivos || []).filter(f =>
    /\.html?$/i.test(f.name || '') || f.language === 'html'
  );
  if (html.length === 0) return null;
  return html.find(f => f.isMain)
    || html.find(f => (f.name || '').toLowerCase() === 'index.html')
    || html[0];
}

/**
 * Devolve o HTML que o preview deve renderizar, com os arquivos do projeto já embutidos.
 *
 * Quando não há página nenhuma no projeto (só um script solto, por exemplo), devolve o conteúdo do
 * arquivo aberto — o preview tem um modo de rodar JavaScript puro que dá conta desse caso.
 */
export function montarPreview(
  arquivos: CodeRepositoryFile[],
  arquivoAberto: CodeRepositoryFile | null | undefined
): string {
  const lista = Array.isArray(arquivos) ? arquivos : [];
  const abertoEhPagina = !!arquivoAberto && (/\.html?$/i.test(arquivoAberto.name || '') || arquivoAberto.language === 'html');

  const pagina = abertoEhPagina ? arquivoAberto : paginaPrincipal(lista);
  if (!pagina) return arquivoAberto?.content || '';

  // O conteúdo do arquivo ABERTO tem prioridade sobre a cópia guardada na lista: durante a
  // digitação a lista pode estar um instante atrás, e o preview ficaria mostrando o texto anterior.
  const conteudoDe = (nome: string): CodeRepositoryFile | undefined => {
    const alvo = nomeDoCaminho(nome).toLowerCase();
    if (!alvo) return undefined;
    const achado = lista.find(f => (f.name || '').toLowerCase() === alvo);
    if (achado && arquivoAberto && achado.id === arquivoAberto.id) return arquivoAberto;
    return achado;
  };

  let html = (pagina.id === arquivoAberto?.id ? arquivoAberto.content : pagina.content) || '';

  html = html.replace(RE_LINK_CSS, (tagInteira) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tagInteira)) return tagInteira;
    const href = tagInteira.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!href || ehEndereçoExterno(href)) return tagInteira;
    const arquivo = conteudoDe(href);
    if (!arquivo) return tagInteira;
    return `<style data-osone-origem="${arquivo.name}">\n${protegerFechamento(arquivo.content, 'style')}\n</style>`;
  });

  html = html.replace(RE_SCRIPT_SRC, (tagInteira, antes, src, depois) => {
    if (!src || ehEndereçoExterno(src)) return tagInteira;
    const arquivo = conteudoDe(src);
    if (!arquivo) return tagInteira;
    // 'type' é preservado (module, importmap): trocá-lo mudaria como o navegador executa o script.
    const tipo = `${antes || ''} ${depois || ''}`.match(/type\s*=\s*["']([^"']+)["']/i)?.[1];
    const atributoTipo = tipo ? ` type="${tipo}"` : '';
    return `<script${atributoTipo} data-osone-origem="${arquivo.name}">\n${protegerFechamento(arquivo.content, 'script')}\n</script>`;
  });

  return html;
}
