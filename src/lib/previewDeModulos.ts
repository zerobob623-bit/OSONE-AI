import { CodeRepositoryFile } from '../types';
import { chaveDeCaminho, resolverCaminhoRelativo } from './caminhosDoCode';

/**
 * RODAR UM PROJETO DE MÓDULOS — React, TSX e vários arquivos — DENTRO DO PREVIEW.
 *
 * ====== O BURACO QUE ISTO FECHA ======
 *
 * Depois que a IA passou a escrever o projeto inteiro (projetoMultiArquivo.ts), ela começou a
 * produzir exatamente o que se espera de um app moderno: src/App.tsx importando
 * src/components/Header.tsx, que importa react. E o preview não rodava nada disso. Ele monta uma
 * página embutindo <link> e <script src>, o que resolve HTML/CSS/JS solto e falha por completo em
 * "import { Header } from './components/Header'": o navegador não sabe o que é "react", não sabe
 * ler TSX, e não tem node_modules para consultar.
 *
 * O resultado era o pior dos dois mundos: a IA passava a gerar projeto de verdade, e o preview
 * mostrava tela em branco. Gerar melhor e mostrar pior.
 *
 * ====== POR QUE NÃO PRECISA DE npm NEM DE EMPACOTADOR ======
 *
 * São duas peças, e as duas rodam no próprio navegador:
 *
 * 1. AS DEPENDÊNCIAS, por mapa de importação. Um <script type="importmap"> diz ao navegador que
 *    "react" mora em https://esm.sh/react. É recurso nativo — nada é instalado, nada é empacotado.
 *
 * 2. OS ARQUIVOS DO PROJETO, por compilação em memória. O compilador do TypeScript (o mesmo que o
 *    preview já carrega para rodar TS solto) transforma cada .tsx em JavaScript, e cada módulo
 *    vira um Blob com endereço próprio.
 *
 * ====== A DECISÃO QUE SUSTENTA TUDO: REESCREVER OS CAMINHOS ======
 *
 * O caminho ingênuo seria pôr os arquivos do projeto no mapa de importação também. Não funciona, e
 * o motivo é sutil: dentro de um módulo Blob, "./components/Header" é resolvido contra o endereço
 * do próprio Blob — que é opaco e não tem pasta. O import quebra antes de o mapa ser consultado.
 *
 * Por isso os caminhos relativos são TROCADOS pelo endereço do Blob de destino, na compilação. E
 * isso impõe uma ordem: o Blob de um módulo só pode ser criado depois dos Blobs de quem ele
 * importa — daí a ordenação por dependência aqui embaixo, e a mensagem clara quando há ciclo.
 */

/** Onde as dependências são buscadas. esm.sh entrega qualquer pacote npm já pronto para o navegador. */
const CDN_DE_MODULOS = 'https://esm.sh';

/** Versão do compilador — a mesma que o preview já usa para o modo TypeScript solto. */
const CDN_DO_TYPESCRIPT = 'https://cdn.jsdelivr.net/npm/typescript@5.8.2/lib/typescript.js';

const EXTENSOES_DE_MODULO = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];

/** Pega os alvos de todo import/export "from", e também do import() dinâmico. */
const RE_ESPECIFICADOR = /(?:\bfrom\s*|\bimport\s*)\(?\s*['"]([^'"]+)['"]\s*\)?/g;

export function ehArquivoDeModulo(nome: string): boolean {
  const n = (nome || '').toLowerCase();
  return EXTENSOES_DE_MODULO.some(ext => n.endsWith(ext));
}

function ehEspecificadorRelativo(especificador: string): boolean {
  return especificador.startsWith('./') || especificador.startsWith('../') || especificador.startsWith('/');
}

/** Todos os especificadores citados num arquivo, sem repetir. */
export function extrairEspecificadores(codigo: string): string[] {
  const achados = new Set<string>();
  const re = new RegExp(RE_ESPECIFICADOR.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo || '')) !== null) {
    if (m[1]) achados.add(m[1]);
  }
  return [...achados];
}

/**
 * Acha o arquivo do projeto que um especificador relativo aponta.
 *
 * O import quase nunca traz extensão ("./components/Header"), e é exatamente por isso que existe
 * esta busca: sem ela, todo import interno de um projeto TypeScript falharia — que é o formato em
 * que TODO projeto TypeScript é escrito.
 */
export function resolverModuloDoProjeto(
  origem: string, especificador: string, arquivos: CodeRepositoryFile[]
): CodeRepositoryFile | null {
  const alvo = resolverCaminhoRelativo(origem, especificador);
  if (!alvo) return null;

  const achar = (caminho: string) =>
    arquivos.find(a => chaveDeCaminho(a.name || '') === chaveDeCaminho(caminho)) || null;

  const direto = achar(alvo);
  if (direto) return direto;

  for (const ext of EXTENSOES_DE_MODULO) {
    const comExtensao = achar(`${alvo}${ext}`);
    if (comExtensao) return comExtensao;
  }
  // "./components" apontando para a pasta: o index dela é o módulo.
  for (const ext of EXTENSOES_DE_MODULO) {
    const indice = achar(`${alvo}/index${ext}`);
    if (indice) return indice;
  }
  return null;
}

/** Um projeto que precisa deste caminho: tem módulo com import relativo ou dependência externa. */
export function precisaDeModulos(arquivos: CodeRepositoryFile[]): boolean {
  const lista = (arquivos || []).filter(a => ehArquivoDeModulo(a.name || ''));
  if (!lista.length) return false;
  return lista.some(a => extrairEspecificadores(a.content || '').some(e =>
    ehEspecificadorRelativo(e) || !!nomeDoPacote(e)
  ));
}

/**
 * O nome do pacote npm dentro de um especificador — ou vazio, se não for pacote.
 *
 * "react" vira "react"; "react-dom/client" vira "react-dom"; "@scope/lib/x" vira "@scope/lib".
 * Endereço completo (http) não é pacote: já sabe de onde vem.
 */
export function nomeDoPacote(especificador: string): string {
  const e = (especificador || '').trim();
  if (!e || ehEspecificadorRelativo(e) || /^[a-z][a-z0-9+.-]*:/i.test(e)) return '';
  const partes = e.split('/');
  return e.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
}

/**
 * O mapa de importação do projeto: todo especificador externo apontando para o CDN.
 *
 * O especificador COMPLETO entra no mapa, e não só o nome do pacote. "react-dom/client" precisa
 * de entrada própria — mapear apenas "react-dom" deixaria o subcaminho sem destino, e é justamente
 * ele que todo app React moderno importa.
 */
export function montarMapaDeImportacoes(arquivos: CodeRepositoryFile[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const arquivo of arquivos) {
    if (!ehArquivoDeModulo(arquivo.name || '')) continue;
    for (const especificador of extrairEspecificadores(arquivo.content || '')) {
      if (!nomeDoPacote(especificador)) continue;
      mapa[especificador] = `${CDN_DE_MODULOS}/${especificador}`;
    }
  }
  /**
   * O runtime do JSX entra sempre, mesmo sem ninguém tê-lo escrito.
   *
   * O compilador é que o inventa: com a transformação moderna de JSX, um arquivo que só escreve
   * <div/> sai com um import de "react/jsx-runtime" que não existe em lugar nenhum do código-fonte.
   * Sem esta entrada, todo projeto React quebraria num import que a pessoa não escreveu e não acha.
   */
  if (Object.keys(mapa).some(k => k === 'react' || k.startsWith('react/') || k.startsWith('react-dom'))) {
    mapa['react/jsx-runtime'] = `${CDN_DE_MODULOS}/react/jsx-runtime`;
    mapa['react/jsx-dev-runtime'] = `${CDN_DE_MODULOS}/react/jsx-dev-runtime`;
  }
  return mapa;
}

export interface OrdemDosModulos {
  ordem: CodeRepositoryFile[];
  /** Ciclo encontrado, com os caminhos envolvidos. Vazio quando o grafo é limpo. */
  ciclo: string[];
}

/**
 * Ordena os módulos para que ninguém seja compilado antes de quem ele importa.
 *
 * É requisito da reescrita de caminhos: o endereço do Blob de "./Header" precisa existir antes de
 * "App" ser compilado, porque ele entra dentro do código de App.
 */
export function ordenarPorDependencia(arquivos: CodeRepositoryFile[]): OrdemDosModulos {
  const modulos = arquivos.filter(a => ehArquivoDeModulo(a.name || ''));
  const ordem: CodeRepositoryFile[] = [];
  const prontos = new Set<string>();
  const naPilha = new Set<string>();
  let ciclo: string[] = [];

  const visitar = (arquivo: CodeRepositoryFile, caminho: string[]) => {
    const chave = chaveDeCaminho(arquivo.name || '');
    if (prontos.has(chave)) return;
    if (naPilha.has(chave)) {
      if (!ciclo.length) ciclo = [...caminho.slice(caminho.indexOf(arquivo.name)), arquivo.name];
      return;
    }
    naPilha.add(chave);
    for (const especificador of extrairEspecificadores(arquivo.content || '')) {
      if (!ehEspecificadorRelativo(especificador)) continue;
      const dependencia = resolverModuloDoProjeto(arquivo.name || '', especificador, modulos);
      if (dependencia) visitar(dependencia, [...caminho, arquivo.name]);
    }
    naPilha.delete(chave);
    prontos.add(chave);
    ordem.push(arquivo);
  };

  for (const arquivo of modulos) visitar(arquivo, []);
  return { ordem, ciclo };
}

/**
 * O módulo por onde a execução começa.
 *
 * A ordem de preferência não é estética: "src/main" e "src/index" são as convenções que Vite e
 * Create React App usam, e é o que a IA gera quando pede para montar um projeto. Só depois vale
 * chutar pelo que monta o React na página.
 */
export function acharEntrada(arquivos: CodeRepositoryFile[]): CodeRepositoryFile | null {
  const modulos = arquivos.filter(a => ehArquivoDeModulo(a.name || ''));
  if (!modulos.length) return null;

  const preferidos = [
    'src/main.tsx', 'src/main.ts', 'src/main.jsx', 'src/main.js',
    'src/index.tsx', 'src/index.ts', 'src/index.jsx', 'src/index.js',
    'main.tsx', 'main.jsx', 'main.ts', 'main.js',
    'index.tsx', 'index.jsx', 'index.ts', 'index.js'
  ];
  for (const nome of preferidos) {
    const achado = modulos.find(a => chaveDeCaminho(a.name || '') === chaveDeCaminho(nome));
    if (achado) return achado;
  }

  const montaNaPagina = modulos.find(a => /createRoot|ReactDOM\.render|document\.getElementById\(/.test(a.content || ''));
  if (montaNaPagina) return montaNaPagina;

  // Último recurso: quem ninguém importa é a ponta do grafo, e ponta de grafo costuma ser entrada.
  const importados = new Set<string>();
  for (const arquivo of modulos) {
    for (const especificador of extrairEspecificadores(arquivo.content || '')) {
      if (!ehEspecificadorRelativo(especificador)) continue;
      const alvo = resolverModuloDoProjeto(arquivo.name || '', especificador, modulos);
      if (alvo) importados.add(chaveDeCaminho(alvo.name || ''));
    }
  }
  return modulos.find(a => !importados.has(chaveDeCaminho(a.name || ''))) || modulos[0];
}

function protegerFechamentoDeScript(texto: string): string {
  return (texto || '').replace(/<\/script/gi, '<\\/script');
}

export interface PaginaDeModulos {
  html: string;
  entrada: string;
  /** Os pacotes externos que o projeto vai buscar no CDN. Serve para a tela dizer o que carregou. */
  dependencias: string[];
  /** Preenchido quando há ciclo entre os módulos: o preview mostra o motivo em vez de tela branca. */
  erro?: string;
}

/**
 * Monta a página que roda o projeto de módulos dentro do iframe.
 *
 * O CSS do projeto entra embutido (o preview já fazia isso), e a página usada é a do projeto quando
 * existe — assim o app encontra a <div id="root"> que ele espera, em vez de uma inventada aqui.
 */
export function montarPreviewDeModulos(
  arquivos: CodeRepositoryFile[],
  opcoes: { paginaHtml?: string | null; cssEmbutido?: string } = {}
): PaginaDeModulos {
  const modulos = arquivos.filter(a => ehArquivoDeModulo(a.name || ''));
  const entrada = acharEntrada(arquivos);
  const { ordem, ciclo } = ordenarPorDependencia(arquivos);
  const mapa = montarMapaDeImportacoes(arquivos);

  if (!entrada) {
    return { html: '', entrada: '', dependencias: [], erro: 'Não achei o arquivo por onde o projeto começa.' };
  }
  if (ciclo.length) {
    return {
      html: '', entrada: entrada.name, dependencias: Object.keys(mapa),
      erro: `Os módulos se importam em círculo (${ciclo.join(' → ')}). Quebre o ciclo para o projeto poder rodar.`
    };
  }

  const fontes = ordem.map(a => ({ caminho: a.name, codigo: a.content || '' }));
  const dependenciasRelativas = ordem.map(a => ({
    caminho: a.name,
    // A resolução acontece AQUI, onde existe a lista de arquivos — o script do iframe recebe o
    // trabalho pronto e só troca texto. Refazer a resolução lá dentro duplicaria as regras de
    // extensão e de index, e duas cópias divergem.
    alvos: extrairEspecificadores(a.content || '')
      .filter(ehEspecificadorRelativo)
      .map(especificador => ({
        especificador,
        destino: resolverModuloDoProjeto(a.name || '', especificador, modulos)?.name || ''
      }))
      .filter(x => x.destino)
  }));

  const corpoDaPagina = opcoes.paginaHtml && /<body[\s>]/i.test(opcoes.paginaHtml)
    ? opcoes.paginaHtml
    : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
</head><body><div id="root"></div></body></html>`;

  const dados = protegerFechamentoDeScript(JSON.stringify({
    fontes, dependenciasRelativas, entrada: entrada.name
  }));

  const carregador = `
<script type="importmap">${protegerFechamentoDeScript(JSON.stringify({ imports: mapa }, null, 2))}</script>
<style>#osone-erro-modulos{position:fixed;inset:auto 0 0 0;z-index:2147483647;background:#2b0d0d;color:#ffb4b4;font:12px/1.5 ui-monospace,monospace;padding:10px 14px;white-space:pre-wrap;max-height:45vh;overflow:auto}</style>
<script>
(function () {
  var DADOS = ${dados};
  function mostrarErro(texto) {
    var caixa = document.getElementById('osone-erro-modulos');
    if (!caixa) {
      caixa = document.createElement('pre');
      caixa.id = 'osone-erro-modulos';
      document.body.appendChild(caixa);
    }
    caixa.textContent = String(texto);
    /*
      O erro TAMBÉM sobe para o editor, e não só para esta caixa.

      Falha de módulo chega como rejeição de promessa do import() dinâmico, que NÃO dispara o
      window.onerror que o preview já instala — então, sem este aviso, o laço de conserto ("o
      projeto não subiu, arrume") ficaria cego justamente no caminho novo: a tela mostraria o erro
      e a IA nunca ficaria sabendo dele. Era o defeito que errosDoPreview.ts já tinha resolvido
      para o caminho antigo, e que voltaria pela porta dos fundos.
    */
    try {
      window.parent.postMessage({ type: 'PREVIEW_ERROR', error: { message: String(texto).split('\\n').join(' ') } }, '*');
    } catch (e) { /* preview sem parent não impede o resto */ }
  }
  function carregarCompilador() {
    return new Promise(function (ok, falhou) {
      if (window.ts) return ok(window.ts);
      var s = document.createElement('script');
      s.src = ${JSON.stringify(CDN_DO_TYPESCRIPT)};
      s.onload = function () { ok(window.ts); };
      s.onerror = function () { falhou(new Error('não consegui baixar o compilador TypeScript — sem internet?')); };
      document.head.appendChild(s);
    });
  }
  carregarCompilador().then(function (ts) {
    var enderecos = {};
    for (var i = 0; i < DADOS.fontes.length; i++) {
      var fonte = DADOS.fontes[i];
      var codigo = fonte.codigo;

      // Troca "./Header" pelo endereço do Blob já criado. A ordem garante que ele existe.
      var relativos = (DADOS.dependenciasRelativas.find(function (d) { return d.caminho === fonte.caminho; }) || {}).alvos || [];
      for (var j = 0; j < relativos.length; j++) {
        var alvo = relativos[j];
        var endereco = enderecos[alvo.destino];
        if (!endereco) continue;
        /*
          Troca por split/join, e NÃO por expressão regular.
          Montar uma regex aqui exigiria escapar o especificador dentro de um texto que já vive
          dentro de outro texto — foi o que quebrou na primeira versão: os escapes se comiam e a
          troca simplesmente não acontecia, deixando "./App" cru no código e o navegador reclamando
          de um endereço que ele não sabe resolver. Comparar texto puro não tem escape para errar.
        */
        var novoAlvo = JSON.stringify(endereco);
        codigo = codigo.split("'" + alvo.especificador + "'").join(novoAlvo);
        codigo = codigo.split('"' + alvo.especificador + '"').join(novoAlvo);
      }

      var saida;
      try {
        saida = ts.transpileModule(codigo, {
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
            isolatedModules: true
          },
          fileName: fonte.caminho
        }).outputText;
      } catch (e) {
        mostrarErro('Erro ao compilar ' + fonte.caminho + ':\\n' + (e && e.message ? e.message : e));
        return;
      }

      enderecos[fonte.caminho] = URL.createObjectURL(new Blob([saida], { type: 'text/javascript' }));
    }

    var entrada = enderecos[DADOS.entrada];
    if (!entrada) { mostrarErro('Não achei o módulo de entrada: ' + DADOS.entrada); return; }
    import(entrada).catch(function (e) {
      mostrarErro('O projeto não subiu:\\n' + (e && e.message ? e.message : e));
    });
  }).catch(function (e) { mostrarErro(e && e.message ? e.message : String(e)); });

  window.addEventListener('error', function (ev) {
    if (ev && ev.message) mostrarErro(ev.message);
  });
})();
</script>`;

  const estilo = opcoes.cssEmbutido ? `<style>${opcoes.cssEmbutido}</style>` : '';
  const html = corpoDaPagina.replace(/<\/body>/i, `${estilo}${carregador}\n</body>`);

  return {
    html: html === corpoDaPagina ? `${corpoDaPagina}${estilo}${carregador}` : html,
    entrada: entrada.name,
    dependencias: [...new Set(Object.keys(mapa).map(nomeDoPacote).filter(Boolean))]
  };
}
