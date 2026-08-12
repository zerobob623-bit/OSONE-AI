/**
 * Confere o preview de PROJETO DE MÓDULOS — React, TSX e vários arquivos se importando.
 *
 * Depois que a IA passou a escrever o projeto inteiro, ela começou a gerar exatamente o que se
 * espera de um app moderno: src/App.tsx importando src/components/Header.tsx, que importa react. O
 * preview antigo não rodava nada disso — resultado, tela em branco. Gerar melhor e mostrar pior.
 *
 * Aqui há dois blocos, e o segundo é o que vale.
 *
 *   1. As peças puras (achar os imports, resolver "./Header" sem extensão, ordenar por
 *      dependência, detectar ciclo, montar o mapa de importação).
 *   2. O PROJETO RODANDO NUM CHROMIUM DE VERDADE. É a única prova que interessa: mapa de
 *      importação, compilação de TSX em memória, Blob por módulo e a reescrita dos caminhos
 *      relativos só se provam juntos, executando. Cada uma isolada pode estar certa e a página
 *      continuar branca.
 *
 * O CDN é trocado por um servidor local no teste — não para fingir que funciona, mas para o
 * conferidor não depender da internet nem da disponibilidade do esm.sh. O caminho exercitado é o
 * mesmo, inclusive a resolução pelo mapa de importação e o import de "react/jsx-runtime" que o
 * compilador inventa sozinho.
 *
 * Como rodar:
 *   node scripts/conferir-preview-modulos.mjs
 */
import { build } from 'esbuild';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-modulos-'));
const saida = path.join(pastaTemp, 'modulos.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/previewDeModulos.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const {
  extrairEspecificadores, resolverModuloDoProjeto, ordenarPorDependencia,
  montarMapaDeImportacoes, acharEntrada, precisaDeModulos, montarPreviewDeModulos, nomeDoPacote
} = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const arq = (name, content) => ({ id: `id-${name}`, name, language: 'typescript', content, updatedAt: 1 });

// ============================================================================
// 1) AS PEÇAS
// ============================================================================
{
  const codigo = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { Header } from './components/Header';
    export * from '../shared/tipos';
    const tarde = await import('./tarde');
  `;
  const achados = extrairEspecificadores(codigo);
  registrar('acha import, export-from e import dinâmico',
    ['react', 'react-dom/client', './components/Header', '../shared/tipos', './tarde'].every(e => achados.includes(e)),
    achados.join(', '));

  registrar('separa o nome do pacote do subcaminho',
    nomeDoPacote('react-dom/client') === 'react-dom' && nomeDoPacote('@scope/lib/x') === '@scope/lib'
      && nomeDoPacote('./local') === '' && nomeDoPacote('https://x.com/a.js') === '',
    'react-dom/client → react-dom');
}

{
  const arquivos = [
    arq('src/App.tsx', `import { Header } from './components/Header';`),
    arq('src/components/Header.tsx', 'export const Header = () => null;'),
    arq('src/utils/index.ts', 'export const x = 1;')
  ];

  registrar('"./components/Header" sem extensão acha o .tsx',
    resolverModuloDoProjeto('src/App.tsx', './components/Header', arquivos)?.name === 'src/components/Header.tsx',
    'é assim que TODO projeto TypeScript escreve import');

  registrar('"./utils" apontando para pasta acha o index dela',
    resolverModuloDoProjeto('src/App.tsx', './utils', arquivos)?.name === 'src/utils/index.ts',
    'convenção de pasta com index');
}

{
  const arquivos = [
    arq('src/main.tsx', `import App from './App';`),
    arq('src/App.tsx', `import { Header } from './components/Header';`),
    arq('src/components/Header.tsx', 'export const Header = () => null;')
  ];
  const { ordem, ciclo } = ordenarPorDependencia(arquivos);
  const nomes = ordem.map(a => a.name);

  registrar('quem é importado é compilado ANTES de quem importa',
    nomes.indexOf('src/components/Header.tsx') < nomes.indexOf('src/App.tsx')
      && nomes.indexOf('src/App.tsx') < nomes.indexOf('src/main.tsx') && !ciclo.length,
    nomes.join(' → '));

  const comCiclo = ordenarPorDependencia([
    arq('a.ts', `import './b';`),
    arq('b.ts', `import './a';`)
  ]);
  registrar('ciclo entre módulos é detectado, e não vira laço infinito',
    comCiclo.ciclo.length > 0, comCiclo.ciclo.join(' → '));
}

{
  const arquivos = [
    arq('src/main.tsx', `import { createRoot } from 'react-dom/client';\nimport App from './App';`),
    arq('src/App.tsx', `import React from 'react';\nexport default () => <div/>;`)
  ];
  const mapa = montarMapaDeImportacoes(arquivos);

  registrar('o subcaminho do pacote ganha entrada própria no mapa',
    !!mapa['react-dom/client'] && mapa['react-dom/client'].includes('esm.sh'),
    'mapear só "react-dom" deixaria "/client" sem destino');

  registrar('o runtime do JSX entra mesmo sem ninguém tê-lo escrito',
    !!mapa['react/jsx-runtime'],
    'o compilador é que o inventa — sem isto, todo projeto React quebra num import invisível');

  registrar('projeto de módulos é reconhecido; página solta não é',
    precisaDeModulos(arquivos) === true
      && precisaDeModulos([{ id: '1', name: 'index.html', language: 'html', content: '<h1>oi</h1>', updatedAt: 1 }]) === false,
    'o caminho antigo continua valendo para HTML/CSS/JS solto');

  registrar('a entrada preferida é a convenção (src/main), e não um arquivo qualquer',
    acharEntrada(arquivos)?.name === 'src/main.tsx', acharEntrada(arquivos)?.name);
}


{
  /**
   * O erro de módulo precisa CHEGAR AO EDITOR, e não só à tela do preview.
   *
   * Falha de import chega como rejeição de promessa, que não dispara o window.onerror que o
   * preview instala. Sem o aviso explícito, o laço de conserto ficaria cego no caminho novo: a
   * pessoa veria o erro e a IA nunca ficaria sabendo dele.
   */
  const comErro = montarPreviewDeModulos([
    arq('src/main.ts', `import { x } from './nao-existe';\nconsole.log(x);`)
  ], { paginaHtml: null });

  registrar('o erro de módulo é avisado ao editor, para o laço de conserto enxergar',
    /PREVIEW_ERROR/.test(comErro.html), 'postMessage com o motivo sai junto da caixa vermelha');

  const comCiclo = montarPreviewDeModulos([
    arq('a.ts', `import './b';`), arq('b.ts', `import './a';`)
  ], { paginaHtml: null });
  registrar('ciclo vira mensagem explicada, e não tela em branco',
    !!comCiclo.erro && /círculo/.test(comCiclo.erro), comCiclo.erro);
}

// ============================================================================
// 2) O PROJETO RODANDO DE VERDADE
// ============================================================================
const CHROMIUM = ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .find(c => { try { return fs.existsSync(c); } catch { return false; } });

if (!CHROMIUM) {
  console.log('  (pulado) sem Chromium para rodar o projeto de verdade.');
} else {
  /**
   * Um projeto como a IA gera: entrada, componente e um módulo de dados, em TSX, com React.
   * O texto na tela só aparece se TUDO funcionar junto — mapa de importação, compilação do TSX,
   * Blob por módulo e a troca de "./components/Header" pelo endereço do Blob.
   */
  const projeto = [
    arq('src/main.tsx', [
      `import { createRoot } from 'react-dom/client';`,
      `import { App } from './App';`,
      `createRoot(document.getElementById('root')!).render(<App />);`
    ].join('\n')),
    arq('src/App.tsx', [
      `import { Header } from './components/Header';`,
      `import { TITULO } from './dados';`,
      `export const App = () => <main><Header texto={TITULO} /></main>;`
    ].join('\n')),
    arq('src/components/Header.tsx', [
      `export const Header = ({ texto }: { texto: string }) => <h1 id="alvo">{texto}</h1>;`
    ].join('\n')),
    arq('src/dados.ts', `export const TITULO = 'PROJETO DE MODULOS NO AR';`),
    { id: 'css', name: 'src/estilo.css', language: 'css', content: '#alvo { color: rgb(1, 2, 3); }', updatedAt: 1 }
  ];

  const montado = montarPreviewDeModulos(projeto, {
    paginaHtml: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>',
    cssEmbutido: '#alvo { color: rgb(1, 2, 3); }'
  });

  /**
   * O CDN vira servidor local: o conferidor não pode depender da internet nem do esm.sh estar de
   * pé. O caminho exercitado é o mesmo — o navegador continua resolvendo pelo mapa de importação.
   */
  const stubs = {
    '/react/jsx-runtime': `
      function criar(tipo, props) { return { tipo, props: props || {} }; }
      export const jsx = criar; export const jsxs = criar; export const Fragment = 'fragment';`,
    '/react': `export default {}; export function useState(v){ return [v, function(){}]; }`,
    '/react-dom/client': `
      function desenhar(no, elemento) {
        if (elemento == null || elemento === false) return;
        if (typeof elemento === 'string' || typeof elemento === 'number') {
          no.appendChild(document.createTextNode(String(elemento))); return;
        }
        if (Array.isArray(elemento)) { elemento.forEach(function (e) { desenhar(no, e); }); return; }
        var tipo = elemento.tipo, props = elemento.props || {};
        if (typeof tipo === 'function') { desenhar(no, tipo(props)); return; }
        var el = document.createElement(tipo === 'fragment' ? 'div' : tipo);
        Object.keys(props).forEach(function (k) {
          if (k === 'children') return;
          try { el.setAttribute(k, props[k]); } catch (e) {}
        });
        desenhar(el, props.children);
        no.appendChild(el);
      }
      export function createRoot(no) { return { render: function (el) { desenhar(no, el); } }; }`
  };

  const servidor = http.createServer((req, res) => {
    const caminho = req.url.split('?')[0];
    if (caminho === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      // Aponta o mapa de importação para este servidor, e o compilador para a cópia local.
      const local = montado.html
        .replace(/https:\/\/esm\.sh/g, 'http://127.0.0.1:4377')
        .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/typescript@[^"']+/g, 'http://127.0.0.1:4377/typescript.js')
        .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/g, '');
      res.end(local);
      return;
    }
    if (caminho === '/typescript.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      fs.createReadStream(path.join(RAIZ, 'node_modules/typescript/lib/typescript.js')).pipe(res);
      return;
    }
    const stub = stubs[caminho] || stubs[caminho.replace(/\.js$/, '')];
    if (stub) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(stub);
      return;
    }
    res.writeHead(404); res.end('');
  });
  await new Promise(r => servidor.listen(4377, '127.0.0.1', r));

  const perfil = fs.mkdtempSync(path.join(RAIZ, 'node_modules', '.perfil-modulos-'));
  const navegador = spawn(CHROMIUM, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=9355', `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: 'ignore' });

  const dormir = (ms) => new Promise(r => setTimeout(r, ms));
  const pegarJson = (c) => new Promise((ok, falhou) => {
    http.get(`http://127.0.0.1:9355${c}`, res => {
      let corpo = ''; res.on('data', d => corpo += d);
      res.on('end', () => { try { ok(JSON.parse(corpo)); } catch (e) { falhou(e); } });
    }).on('error', falhou);
  });

  let ws = null;
  try {
    for (let i = 0; i < 60 && !ws; i++) {
      try {
        const aba = (await pegarJson('/json/list')).find(a => a.type === 'page');
        if (aba) { ws = new WebSocket(aba.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r)); }
      } catch { await dormir(500); }
    }
    if (!ws) throw new Error('o Chromium não respondeu.');

    let id = 1;
    const pendentes = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pendentes.has(msg.id)) { pendentes.get(msg.id)(msg); pendentes.delete(msg.id); }
    });
    const enviar = (method, params = {}) => new Promise(ok => {
      const n = id++; pendentes.set(n, ok); ws.send(JSON.stringify({ id: n, method, params }));
    });

    await enviar('Runtime.enable');
    await enviar('Page.enable');
    await enviar('Page.navigate', { url: 'http://127.0.0.1:4377/' });

    let estado = { texto: '', erro: '', cor: '' };
    for (let i = 0; i < 60; i++) {
      const r = await enviar('Runtime.evaluate', {
        expression: `JSON.stringify({
          texto: document.getElementById('alvo') ? document.getElementById('alvo').textContent : '',
          erro: document.getElementById('osone-erro-modulos') ? document.getElementById('osone-erro-modulos').textContent : '',
          cor: document.getElementById('alvo') ? getComputedStyle(document.getElementById('alvo')).color : ''
        })`, returnByValue: true
      });
      estado = JSON.parse(r.result.result.value);
      if (estado.texto || estado.erro) break;
      await dormir(500);
    }

    registrar('um projeto React de VÁRIOS arquivos TSX desenha na tela',
      estado.texto === 'PROJETO DE MODULOS NO AR',
      estado.erro ? `ERRO NA PÁGINA: ${estado.erro.slice(0, 160)}` : `texto="${estado.texto}"`);

    registrar('o import entre arquivos do projeto foi resolvido',
      estado.texto.length > 0 && !estado.erro,
      'src/main → src/App → src/components/Header → src/dados, todos ligados');

    registrar('o CSS do projeto entra junto com os módulos',
      estado.cor === 'rgb(1, 2, 3)', `cor lida: ${estado.cor}`);
  } catch (err) {
    registrar('um projeto React de VÁRIOS arquivos TSX desenha na tela', false, err.message);
  } finally {
    try { navegador.kill('SIGKILL'); } catch { /* já morreu */ }
    await new Promise(r => servidor.close(r));
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* some depois */ }
  }
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências do preview de módulos passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
