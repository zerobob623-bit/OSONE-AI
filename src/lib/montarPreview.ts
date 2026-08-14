import { CodeRepositoryFile } from '../types';
import {
  chaveDeCaminho,
  ehEnderecoExternoDoCode,
  nomeBaseDoCaminho,
  resolverCaminhoRelativo
} from './caminhosDoCode';
import { montarPreviewDeModulos, precisaDeModulos } from './previewDeModulos';

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
  return nomeBaseDoCaminho(caminho, '');
}

function ehEndereçoExterno(caminho: string): boolean {
  return ehEnderecoExternoDoCode(caminho);
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

/**
 * UM ARQUIVO IMPORTANDO O OUTRO — sem isto não existe projeto JavaScript de verdade.
 *
 * Embutir o script da página resolvia a tag <script src>, e parava aí. Um `import { soma } from
 * './util.js'` dentro desse script continuava escrito do mesmo jeito, e o preview roda a partir de
 * um documento sem endereço próprio: o navegador não tem contra o que resolver './util.js', o
 * módulo inteiro falha ao carregar e a página fica em branco. O erro aparece no console como um
 * caminho que não existe, o que manda quem está programando procurar defeito no lugar errado —
 * o arquivo está ali, ao lado, e o código está certo.
 *
 * Aqui cada import que aponta para um arquivo DO PROJETO é reescrito para um endereço `data:` com
 * o conteúdo daquele arquivo, recursivamente. Isso vale para qualquer profundidade e não depende
 * de servidor, empacotador nem de o navegador saber onde a página mora.
 *
 * O que NÃO é tocado: import de biblioteca ('react', 'three') e endereço externo. Esses continuam
 * como estão, para o mapa de importações ou a CDN que a pessoa já configurou seguir funcionando.
 */
const RE_ESPECIFICADOR = /(\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

/** Um ciclo de imports não pode virar recursão infinita na hora de montar o preview. */
const PROFUNDIDADE_MAXIMA = 12;

function ehEspecificadorDeProjeto(spec: string): boolean {
  // Só caminho relativo/absoluto de arquivo. 'react' é biblioteca; 'https://...' é externo.
  if (ehEndereçoExterno(spec)) return false;
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/');
}

function paraDataUrl(codigo: string): string {
  // encodeURIComponent em vez de base64: mantém o código legível no depurador do navegador, e
  // não exige btoa (que quebra com acento e emoji, comuns em texto de interface).
  //
  // As ASPAS precisam ser escapadas à mão porque o encodeURIComponent não as toca. Sem isso, um
  // import aninhado — um arquivo que importa outro que importa um terceiro — colocava um endereço
  // contendo aspas DENTRO da string de outro import, fechando essa string antes da hora e
  // transformando a cadeia inteira num erro de sintaxe. Só aparecia a partir do segundo nível.
  return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(codigo)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
}

/**
 * Reescreve os imports de `codigo` para endereços `data:` com o conteúdo dos arquivos do projeto.
 * `achar` devolve o arquivo do projeto correspondente a um caminho, ou undefined.
 */
export function resolverImports(
  codigo: string,
  achar: (caminho: string, origem?: CodeRepositoryFile) => CodeRepositoryFile | undefined,
  visitados: string[] = [],
  profundidade = 0,
  origem?: CodeRepositoryFile
): string {
  if (profundidade > PROFUNDIDADE_MAXIMA) return codigo;

  return (codigo || '').replace(RE_ESPECIFICADOR, (inteiro, prefixo, aspas, spec) => {
    if (!ehEspecificadorDeProjeto(spec)) return inteiro;
    const arquivo = achar(spec, origem);
    if (!arquivo) return inteiro;

    // Ciclo: A importa B que importa A. Deixar o especificador cru faz o navegador falhar com uma
    // mensagem clara, o que é melhor do que montar um preview que trava o computador.
    if (visitados.includes(arquivo.id)) return inteiro;

    const resolvido = resolverImports(arquivo.content || '', achar, [...visitados, arquivo.id], profundidade + 1, arquivo);
    return `${prefixo}${aspas}${paraDataUrl(resolvido)}${aspas}`;
  });
}

function projetoPareceFullstack(arquivos: CodeRepositoryFile[]): boolean {
  return (arquivos || []).some(f => /^(frontend|public|src|server|api|shared)\//i.test(f.name || ''))
    || (arquivos || []).some(f => chaveDeCaminho(f.name || '') === 'package.json');
}

function estaDentroDoFrontend(caminho: string): boolean {
  return /^(frontend|public|src)\//i.test(caminho || '');
}

/** A página do projeto: no fullstack, prioriza o frontend; no simples, preserva index.html. */
export function paginaPrincipal(arquivos: CodeRepositoryFile[]): CodeRepositoryFile | null {
  const html = (arquivos || []).filter(f =>
    /\.html?$/i.test(f.name || '') || f.language === 'html'
  );
  if (html.length === 0) return null;
  const porCaminho = (nome: string) => html.find(f => chaveDeCaminho(f.name || '') === chaveDeCaminho(nome));

  /**
   * Quando existe árvore fullstack, "index.html" na raiz pode ser apenas um rascunho antigo.
   *
   * O botão Fullstack abre o frontend, mas o preview escolhia a página principal dando preferência
   * ao index da raiz. Resultado: a pessoa via o modo fullstack ligado, porém o iframe rodava outro
   * arquivo, com JS antigo tentando escutar elementos que não estavam mais na tela.
   */
  if (projetoPareceFullstack(arquivos)) {
    const principalDoFrontend = html.find(f => f.isMain && estaDentroDoFrontend(f.name || ''))
      || porCaminho('frontend/index.html')
      || porCaminho('public/index.html')
      || porCaminho('src/index.html')
      || html.find(f => estaDentroDoFrontend(f.name || '') && nomeDoCaminho(f.name || '').toLowerCase() === 'index.html');
    if (principalDoFrontend) return principalDoFrontend;
  }

  return html.find(f => f.isMain)
    || porCaminho('index.html')
    || porCaminho('frontend/index.html')
    || porCaminho('public/index.html')
    || porCaminho('src/index.html')
    || html.find(f => nomeDoCaminho(f.name || '').toLowerCase() === 'index.html')
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

  /**
   * PROJETO DE MÓDULOS TEM CAMINHO PRÓPRIO — e ele vem primeiro.
   *
   * Toda a montagem abaixo trabalha embutindo <link> e <script src>: resolve HTML, CSS e JS soltos,
   * e não tem o que fazer com "import { Header } from './components/Header'". Um projeto React de
   * vários arquivos passava por aqui inteiro e chegava ao iframe como tela em branco — o navegador
   * não sabe o que é "react", não lê TSX, e não tem node_modules para consultar.
   *
   * A verificação vem ANTES de tudo porque os dois caminhos são excludentes, e porque a página do
   * projeto (quando existe) é reaproveitada lá dentro: é nela que está a <div id="root"> que o app
   * espera encontrar.
   */
  if (precisaDeModulos(lista)) {
    const cssDoProjeto = lista
      .filter(f => /\.css$/i.test(f.name || '') || f.language === 'css')
      .map(f => (f.id === arquivoAberto?.id ? arquivoAberto.content : f.content) || '')
      .join('\n\n');

    const montado = montarPreviewDeModulos(lista, {
      paginaHtml: pagina ? ((pagina.id === arquivoAberto?.id ? arquivoAberto.content : pagina.content) || '') : null,
      cssEmbutido: cssDoProjeto
    });

    // Erro aqui (ciclo entre módulos, entrada não encontrada) precisa APARECER. Cair de volta na
    // montagem antiga mostraria uma tela em branco sem motivo, que é o comportamento que este
    // caminho existe para acabar.
    if (montado.erro) {
      return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#12060a;color:#ffb4b4;font:13px/1.6 ui-monospace,monospace;padding:16px">`
        + `<strong>O projeto não pôde ser montado</strong><br><br>${montado.erro.replace(/</g, '&lt;')}</body></html>`;
    }
    return montado.html;
  }

  if (!pagina) return arquivoAberto?.content || '';

  // O conteúdo do arquivo ABERTO tem prioridade sobre a cópia guardada na lista: durante a
  // digitação a lista pode estar um instante atrás, e o preview ficaria mostrando o texto anterior.
  const conteudoDe = (nome: string, origem?: CodeRepositoryFile): CodeRepositoryFile | undefined => {
    const origemReal = origem || pagina;
    const alvoRelativo = resolverCaminhoRelativo(origemReal.name || '', nome);
    const candidatos = [
      alvoRelativo,
      nome,
      nomeDoCaminho(nome)
    ].map(c => chaveDeCaminho(c)).filter(Boolean);

    let achado = lista.find(f => candidatos.includes(chaveDeCaminho(f.name || '')));
    // Compatibilidade com projetos antigos: um HTML que aponta para ./css/styles.css ainda encontra
    // styles.css solto se não houver arquivo dentro de css/.
    if (!achado) {
      const base = nomeDoCaminho(nome).toLowerCase();
      achado = lista.find(f => nomeDoCaminho(f.name || '').toLowerCase() === base);
    }
    if (achado && arquivoAberto && achado.id === arquivoAberto.id) return arquivoAberto;
    return achado;
  };

  let html = (pagina.id === arquivoAberto?.id ? arquivoAberto.content : pagina.content) || '';

  html = html.replace(RE_LINK_CSS, (tagInteira) => {
    if (!/rel\s*=\s*["']?stylesheet/i.test(tagInteira)) return tagInteira;
    const href = tagInteira.match(/href\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (!href || ehEndereçoExterno(href)) return tagInteira;
    const arquivo = conteudoDe(href, pagina);
    if (!arquivo) return tagInteira;
    return `<style data-osone-origem="${arquivo.name}">\n${protegerFechamento(arquivo.content, 'style')}\n</style>`;
  });

  html = html.replace(RE_SCRIPT_SRC, (tagInteira, antes, src, depois) => {
    if (!src || ehEndereçoExterno(src)) return tagInteira;
    const arquivo = conteudoDe(src, pagina);
    if (!arquivo) return tagInteira;
    // 'type' é preservado (module, importmap): trocá-lo mudaria como o navegador executa o script.
    const tipo = `${antes || ''} ${depois || ''}`.match(/type\s*=\s*["']([^"']+)["']/i)?.[1];
    const atributoTipo = tipo ? ` type="${tipo}"` : '';
    // Só módulo tem import; num script clássico o mesmo texto seria erro de sintaxe, e reescrever
    // ali estragaria código que por acaso contivesse a palavra 'from' entre aspas.
    const corpo = /module/i.test(tipo || '')
      ? resolverImports(arquivo.content || '', conteudoDe, [arquivo.id], 0, arquivo)
      : (arquivo.content || '');
    return `<script${atributoTipo} data-osone-origem="${arquivo.name}">\n${protegerFechamento(corpo, 'script')}\n</script>`;
  });

  return html;
}
