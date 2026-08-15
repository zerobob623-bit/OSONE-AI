/**
 * Reproduz a TELA BRANCA que aparecia no navegador a cada nova publicação na Vercel.
 *
 * O relato era "100% das vezes quando atualizo", e a explicação está no encontro de duas peças
 * que, sozinhas, parecem inofensivas:
 *
 * 1. O service worker (public/sw.js) respondia pelo cache PRIMEIRO, para qualquer pedido —
 *    inclusive o do próprio index.html. Depois de uma publicação nova, o navegador continuava
 *    recebendo o index.html ANTIGO, que aponta para o pacote de código pelo nome com resumo
 *    (/assets/index-DngDnqid.js). Esse nome muda a cada publicação, então o arquivo citado pelo
 *    HTML antigo já não existe mais no servidor.
 *
 * 2. O vercel.json mandava TUDO o que não fosse arquivo existente para o /index.html. Então o
 *    pedido do pacote que sumiu não voltava como 404: voltava como uma página HTML, com o tipo
 *    text/html. O navegador recusa executar HTML no lugar de um módulo JavaScript, o <div id=
 *    "root"> nunca é preenchido, e o que sobra na tela é branco. Como o cache continua entregando
 *    o mesmo HTML velho, atualizar de novo repete o mesmo resultado — daí o "100% das vezes".
 *
 * O que se verifica aqui é exatamente esse encadeamento, com um service worker de verdade num
 * Chromium de verdade: publica a versão 1, deixa o service worker assumir, publica a versão 2
 * (com outro resumo no nome, e o arquivo antigo removido, como a Vercel faz) e recarrega.
 *
 * O aplicativo de teste é minúsculo de propósito: o defeito mora no sw.js e no vercel.json, e não
 * no OSONE — mas o sw.js e as regras de rota usados aqui são os ARQUIVOS REAIS do projeto, lidos
 * do disco. Se alguém voltar a fazer o cache responder primeiro pelo HTML, ou a mandar arquivo
 * inexistente para o index.html, este conferidor reprova de novo.
 *
 * Como rodar:
 *   npm i -D playwright   (uma vez; o navegador já vem no ambiente de desenvolvimento)
 *   node scripts/conferir-vercel.mjs
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error("Este conferidor precisa do playwright: rode 'npm i -D playwright' e tente de novo.");
  process.exit(2);
}

const SW_REAL = fs.readFileSync(path.join(RAIZ, 'public/sw.js'), 'utf-8');
const VERCEL = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf-8'));

/**
 * O service worker defeituoso, como estava instalado no navegador de quem usa o app.
 *
 * Precisa estar escrito aqui, e não ser lido do git: a pergunta que ele responde é se quem JÁ
 * está com a tela branca destrava sozinho ao publicar o conserto, ou se vai precisar limpar o
 * cache do navegador na mão. Sem uma cópia do defeito não há como perguntar isso.
 */
const SW_DEFEITUOSO = `
const CACHE_NAME = 'osone-cache-v2';
const urlsToCache = ['/', '/index.html', '/manifest.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
`;

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/**
 * Traduz um "source" do vercel.json para expressão regular.
 *
 * Cobre as duas formas que o arquivo usa: o parâmetro nomeado com estrela (/api/:path*) e o
 * grupo entre parênteses, que já é expressão regular e passa direto.
 */
function paraRegex(source) {
  if (source.includes('(')) return new RegExp(`^${source}$`);
  return new RegExp(`^${source.replace(/\/:[A-Za-z]+\*/g, '(?:/.*)?')}$`);
}

/**
 * Servidor que imita a ordem de roteamento da Vercel: primeiro o sistema de arquivos, e só
 * depois as regras de rewrite. É essa ordem que faz um arquivo AINDA existente ser servido
 * normalmente, e um arquivo que sumiu cair na regra de captura.
 */
function subirServidor(pastaAtual) {
  const servidor = http.createServer((req, res) => {
    const caminho = decodeURIComponent((req.url || '/').split('?')[0]);
    const pasta = pastaAtual();

    const entregar = (arquivo) => {
      const tipo = TIPOS[path.extname(arquivo)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(arquivo));
    };

    const noDisco = path.join(pasta, caminho === '/' ? '/index.html' : caminho);
    if (noDisco.startsWith(pasta) && fs.existsSync(noDisco) && fs.statSync(noDisco).isFile()) {
      return entregar(noDisco);
    }

    for (const regra of VERCEL.rewrites || []) {
      if (!paraRegex(regra.source).test(caminho)) continue;
      // /api não existe neste teste: o que importa aqui é o destino estático.
      const destino = path.join(pasta, regra.destination);
      if (fs.existsSync(destino) && fs.statSync(destino).isFile()) return entregar(destino);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('nao encontrado');
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('nao encontrado');
  });
  return new Promise(resolve => servidor.listen(0, '127.0.0.1', () => resolve(servidor)));
}

/** Monta uma "publicação": index.html apontando para um pacote com o resumo indicado no nome. */
function publicar(pasta, resumo, rotulo, sw = SW_REAL) {
  fs.rmSync(pasta, { recursive: true, force: true });
  fs.mkdirSync(path.join(pasta, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'sw.js'), sw);
  fs.writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify({ name: 'OSONE' }));
  fs.writeFileSync(path.join(pasta, 'assets', `app-${resumo}.js`),
    `document.getElementById('root').textContent = ${JSON.stringify(rotulo)};`);
  // O registro do service worker é igual ao do index.html do projeto, sem a condição que pula
  // localhost — aqui o endereço é sempre local, e é justamente o service worker que se testa.
  fs.writeFileSync(path.join(pasta, 'index.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>OSONE</title>
<link rel="manifest" href="/manifest.json">
<script>${registroDoIndexHtml()}</script>
<script type="module" crossorigin src="/assets/app-${resumo}.js"></script>
</head><body><div id="root"></div></body></html>`);
}

/**
 * O registro do service worker sai do index.html REAL do projeto, sem a condição que pula
 * endereços locais — aqui o endereço é sempre local, e é justamente o service worker que se
 * testa. Extrair em vez de copiar é o que faz este conferidor reprovar se alguém tirar do
 * index.html a conferência forçada, que é metade do conserto.
 */
function registroDoIndexHtml() {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf-8');
  const inicio = html.indexOf("window.addEventListener('load'");
  const fim = html.indexOf('</script>', inicio);
  if (inicio === -1 || fim === -1) {
    console.error('Não achei o registro do service worker no index.html — o conferidor precisa dele.');
    process.exit(2);
  }
  // Fica só o corpo do registro, sem a condição que pula endereços locais: o "if" do projeto
  // existe para não registrar em desenvolvimento, e não faz parte do que se está verificando.
  const corpo = html.slice(inicio, fim).replace(/\}\s*$/, '').trimEnd().replace(/\}$/, '');
  return `if ('serviceWorker' in navigator) { ${corpo} }`;
}

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-vercel-'));
const site = path.join(pastaTemp, 'site');
let pasta = site;

const servidor = await subirServidor(() => pasta);
const base = `http://127.0.0.1:${servidor.address().port}`;

const executavel = process.env.CHROMIUM_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(p => fs.existsSync(p));
const nav = await chromium.launch(executavel ? { executablePath: executavel } : {});
const ctx = await nav.newContext({ serviceWorkers: 'allow' });
const pag = await ctx.newPage();

const conteudoDaRaiz = () => pag.locator('#root').innerText().catch(() => '');
const esperarServiceWorkerNoComando = () => pag.evaluate(async () => {
  await navigator.serviceWorker.ready;
  // O controle só chega depois do clients.claim(); sem esperar por ele, a próxima navegação
  // ainda passaria por fora do service worker e o teste não estaria testando nada.
  if (!navigator.serviceWorker.controller) {
    await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  }
  return true;
});

// Publicação 1: o estado normal de quem já usa o app.
publicar(site, 'AAA', 'VERSAO 1');
await pag.goto(base + '/');
await esperarServiceWorkerNoComando();
registrar('a primeira visita monta a página e o service worker assume',
  (await conteudoDaRaiz()) === 'VERSAO 1', `a tela mostra "${await conteudoDaRaiz()}"`);

// Publicação 2: exatamente o que a Vercel faz — outro resumo no nome, e o pacote antigo some.
publicar(site, 'BBB', 'VERSAO 2');

// 1) O caso relatado: atualizar a página depois de publicar.
{
  await pag.reload();
  await pag.waitForTimeout(600);
  const texto = await conteudoDaRaiz();
  registrar('atualizar a página depois de publicar mostra a versão nova, e não uma tela branca',
    texto === 'VERSAO 2',
    texto ? `a tela mostra "${texto}"` : 'TELA BRANCA: o #root ficou vazio');
}

// 2) A tela branca se repetia a cada atualização, porque o cache seguia entregando o HTML velho.
{
  await pag.reload();
  await pag.waitForTimeout(600);
  const texto = await conteudoDaRaiz();
  registrar('atualizar de novo continua mostrando a versão nova',
    texto === 'VERSAO 2',
    texto ? `a tela mostra "${texto}"` : 'TELA BRANCA de novo');
}

// 3) A raiz do problema do lado do servidor: arquivo que sumiu não pode voltar como HTML.
{
  const resposta = await pag.request.get(base + '/assets/app-AAA.js');
  const tipo = (resposta.headers()['content-type'] || '').toLowerCase();
  const ehHtml = tipo.includes('text/html');
  registrar('pacote que já não existe responde 404, e não uma página HTML',
    resposta.status() === 404 || !ehHtml,
    `HTTP ${resposta.status()} com tipo "${tipo}"`);
}

// 4) A regra de captura precisa continuar valendo para endereço de página (rota do app).
{
  const resposta = await pag.request.get(base + '/configuracoes');
  const corpo = await resposta.text();
  registrar('endereço de página continua caindo no index.html do app',
    resposta.status() === 200 && corpo.includes('<div id="root">'),
    `HTTP ${resposta.status()}`);
}

// 5) Sem rede, o app ainda abre: o cache existe para isso, e não pode ter sumido no conserto.
{
  await ctx.setOffline(true);
  await pag.reload().catch(() => {});
  await pag.waitForTimeout(400);
  // O #root existe no HTML estático desde antes do JS rodar (é markup do index.html), então
  // .count() > 0 passaria mesmo se o bundle JS não tivesse sido servido pelo cache e a tela
  // ficasse com a raiz presente mas VAZIA — exatamente a tela branca que este caso existe para
  // pegar. Precisa ser o CONTEÚDO real, igual aos outros casos deste arquivo (conteudoDaRaiz()).
  const texto = await conteudoDaRaiz();
  registrar('sem internet o app ainda abre pelo cache',
    texto === 'VERSAO 2',
    texto ? `a página foi servida pelo cache, mostrando "${texto}"` : 'TELA BRANCA: nada foi servido offline');
  await ctx.setOffline(false);
}

// 6) O conserto precisa alcançar quem JÁ está com a tela branca, sem pedir para limpar o cache.
{
  const ctx2 = await nav.newContext({ serviceWorkers: 'allow' });
  const pag2 = await ctx2.newPage();
  const raiz2 = () => pag2.locator('#root').innerText().catch(() => '');

  // O estado real de hoje: navegador com o service worker defeituoso já instalado e no comando.
  publicar(site, 'AAA', 'VERSAO 1', SW_DEFEITUOSO);
  await pag2.goto(base + '/');
  await pag2.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });

  // Publicação do conserto: pacote novo e o sw.js corrigido no lugar do defeituoso.
  publicar(site, 'BBB', 'VERSAO 2', SW_REAL);

  /**
   * A conferência do /sw.js é forçada de propósito, e é isto que ela representa.
   *
   * Quem está travado tem no navegador o index.html ANTIGO, sem a linha que força a conferência
   * — ela só passa a existir depois que a página nova entra. Então, para esses, quem dispara a
   * conferência é o próprio navegador, na primeira navegação depois da janela de limitação do
   * Chrome (cerca de um dia), ou uma recarga forçada (Ctrl+Shift+R), que ignora o cache.
   *
   * Foi medido aqui que, sem esse empurrão, o navegador não chega nem a pedir o /sw.js: as três
   * recargas seguintes à publicação saíram sem uma única ida ao servidor pela página. Ou seja, a
   * recuperação depende da conferência acontecer — e o que este caso prova é que, quando ela
   * acontece, o conserto chega inteiro: o service worker novo assume, o cache velho é apagado e
   * a página volta. É o que o index.html novo passa a garantir a cada abertura, para sempre.
   */
  await pag2.evaluate(async () => {
    const registro = await navigator.serviceWorker.getRegistration();
    if (registro) await registro.update();
  });
  await pag2.waitForTimeout(1200);
  await pag2.reload();
  await pag2.waitForTimeout(900);
  const texto = await raiz2();
  const cachesRestantes = await pag2.evaluate(() => caches.keys());

  registrar('conferido o /sw.js, quem estava com a tela branca volta a abrir sem limpar nada',
    texto === 'VERSAO 2' && !cachesRestantes.includes('osone-cache-v2'),
    texto === 'VERSAO 2'
      ? `voltou a abrir e o cache velho foi apagado (restou ${JSON.stringify(cachesRestantes)})`
      : 'continuou branco mesmo depois de conferir o service worker');
  await ctx2.close();
}

// 7) O index.html novo não pode depender do agendamento do navegador para conferir o sw.js.
{
  const registro = registroDoIndexHtml();
  const forcaConferencia = /\.update\(\)/.test(registro);
  const ignoraCacheDoScript = /updateViaCache:\s*'none'/.test(registro);
  registrar('o index.html força a conferência do service worker a cada abertura',
    forcaConferencia && ignoraCacheDoScript,
    `update() ${forcaConferencia ? 'presente' : 'AUSENTE'}; updateViaCache 'none' ${ignoraCacheDoScript ? 'presente' : 'AUSENTE'}`);
}

await nav.close();
servidor.close();
fs.rmSync(pastaTemp, { recursive: true, force: true });

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
