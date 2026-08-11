/**
 * Confere o caminho do vídeo das câmeras — as partes que quebram em silêncio.
 *
 * A tentação num conferidor destes é testar as rotas, que é o que se vê. Mas o que de fato derruba
 * este recurso não está nelas: está em três lugares onde a falha não aparece como erro.
 *
 *   1. A TRAVA DO ENDEREÇO. O que vai para o "-i" do ffmpeg é texto que a pessoa digita, e o
 *      ffmpeg lê muito mais que vídeo — "file:/etc/passwd" é entrada válida para ele. Um furo aqui
 *      não dá erro nenhum: entrega o arquivo.
 *   2. O CORTE DOS QUADROS. MJPEG é JPEG colado em JPEG, sem separador nem tamanho declarado, e os
 *      pedaços chegam do cano em fronteiras arbitrárias. Cortar errado mostra imagem rasgada — que
 *      parece problema da câmera, e a pessoa vai mexer na câmera.
 *   3. O ARGUMENTO DO FFMPEG. É a peça que ninguém consegue conferir lendo: ou o ffmpeg aceita a
 *      combinação de duas saídas do mesmo fluxo, ou não aceita. Por isso o último bloco roda o
 *      ffmpeg DE VERDADE, com uma fonte sintética no lugar da câmera, e confere que sai JPEG pelo
 *      cano e miniatura no arquivo — que é exatamente o que o código de produção espera.
 *
 * Como rodar:
 *   node scripts/conferir-cameras.mjs
 */
import { build } from 'esbuild';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cameras-'));

/**
 * O bundle sai DENTRO do projeto, e não na pasta temporária.
 *
 * O módulo importa express e ffmpeg-static, que ficam externos ao bundle — e um arquivo em /tmp
 * não tem node_modules acima dele para resolver esses nomes. Gerar aqui dentro é o que faz o
 * import funcionar sem embutir o express inteiro num bundle ESM, que traz problema de interop CJS.
 */
const pastaDoBundle = path.join(RAIZ, 'node_modules', '.osone-conferidor');
fs.mkdirSync(pastaDoBundle, { recursive: true });
const saida = path.join(pastaDoBundle, 'cameras.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/servicoDeCameras.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: saida,
  packages: 'external', absWorkingDir: RAIZ, logLevel: 'silent'
});
const { validarUrlDeCamera, mascararUrl, extrairQuadros, lerPgm } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ============================================================================
// 1) A TRAVA DO ENDEREÇO
// ============================================================================
{
  const aceitos = [
    'rtsp://admin:1234@192.168.0.10:554/stream1',
    'rtsps://cam.local:322/live',
    'http://192.168.0.11:8080/video',
    'https://cam.exemplo.com/mjpeg'
  ];
  const recusadosDeVerdade = aceitos.filter(u => validarUrlDeCamera(u) !== null);
  registrar('endereço de câmera de verdade é aceito',
    recusadosDeVerdade.length === 0,
    recusadosDeVerdade.length ? `recusou ${recusadosDeVerdade.join(', ')}` : 'rtsp, rtsps, http e https');

  /**
   * Cada um destes é uma entrada VÁLIDA para o ffmpeg, e nenhum é uma câmera. Sem a lista de
   * protocolos, "file:" transformaria o campo de endereço num leitor de arquivos do servidor.
   */
  const perigosos = [
    'file:/etc/passwd',
    'file:///C:/Windows/win.ini',
    'concat:/etc/passwd|/etc/shadow',
    'pipe:0',
    'data:text/plain;base64,QUJD',
    'ftp://exemplo.com/x',
    '/etc/passwd',
    ''
  ];
  const passaram = perigosos.filter(u => validarUrlDeCamera(u) === null);
  registrar('entrada que não é câmera é recusada antes de chegar ao ffmpeg',
    passaram.length === 0,
    passaram.length ? `PASSOU: ${passaram.join(', ')}` : `${perigosos.length} entradas barradas`);

  registrar('a recusa explica o que fazer, e não só que deu errado',
    /rtsp/i.test(validarUrlDeCamera('file:/etc/passwd') || ''),
    'a mensagem diz quais protocolos servem');
}

// ============================================================================
// 2) A SENHA DA CÂMERA NÃO VAI PARA A TELA
// ============================================================================
{
  const mascarada = mascararUrl('rtsp://admin:SenhaSecreta123@192.168.0.10:554/stream1');
  registrar('a senha da câmera nunca aparece na tela',
    !mascarada.includes('SenhaSecreta123'), mascarada);

  registrar('o resto do endereço continua reconhecível',
    mascarada.includes('192.168.0.10') && mascarada.includes('admin') && mascarada.includes('stream1'),
    'dá para conferir se o endereço está certo sem ver a senha');

  registrar('endereço quebrado não derruba a listagem',
    typeof mascararUrl('nada disso') === 'string', mascararUrl('nada disso'));
}

// ============================================================================
// 3) O CORTE DOS QUADROS
// ============================================================================
{
  const jpeg = (marca) => Buffer.concat([
    Buffer.from([0xff, 0xd8]), Buffer.from(`quadro-${marca}`), Buffer.from([0xff, 0xd9])
  ]);

  const tres = Buffer.concat([jpeg('a'), jpeg('b'), jpeg('c')]);
  const inteiro = extrairQuadros(Buffer.alloc(0), tres);
  registrar('quadros grudados são separados um a um',
    inteiro.quadros.length === 3 && inteiro.resto.length === 0,
    `${inteiro.quadros.length} quadros, ${inteiro.resto.length} bytes de sobra`);

  /**
   * O caso que realmente acontece: o pedaço que chega do cano corta um JPEG ao meio. Se o corte
   * fosse feito por pedaço recebido, este teste devolveria dois quadros rasgados em vez de um bom.
   */
  let acumulado = Buffer.alloc(0);
  const recebidos = [];
  for (let i = 0; i < tres.length; i += 7) {
    const r = extrairQuadros(acumulado, tres.subarray(i, i + 7));
    acumulado = r.resto;
    recebidos.push(...r.quadros);
  }
  registrar('quadro partido entre dois pedaços é remontado inteiro',
    recebidos.length === 3 && recebidos.every(q => q[0] === 0xff && q[1] === 0xd8 && q[q.length - 1] === 0xd9),
    `${recebidos.length} quadros, todos começando em FFD8 e terminando em FFD9`);

  registrar('quadro incompleto fica guardado em vez de ir rasgado para a tela',
    extrairQuadros(Buffer.alloc(0), Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from('meio')])).quadros.length === 0,
    'só sai da fila quando fecha');

  const comLixo = extrairQuadros(Buffer.alloc(0), Buffer.concat([Buffer.from('lixo do ffmpeg'), jpeg('x')]));
  registrar('lixo antes do primeiro quadro é descartado',
    comLixo.quadros.length === 1 && comLixo.quadros[0][0] === 0xff,
    'o primeiro quadro sai limpo');

  const soLixo = extrairQuadros(Buffer.alloc(0), Buffer.alloc(3_000_000, 0x41));
  registrar('lixo sem fim não faz a memória crescer para sempre',
    soLixo.resto.length === 0, `${soLixo.resto.length} bytes guardados`);
}

// ============================================================================
// 4) A MINIATURA DE MOVIMENTO
// ============================================================================
{
  const pgm = (largura, altura, preenchimento) => Buffer.concat([
    Buffer.from(`P5\n${largura} ${altura}\n255\n`), Buffer.alloc(largura * altura, preenchimento)
  ]);

  const lido = lerPgm(pgm(32, 18, 120));
  registrar('a miniatura em cinza é lida sem decodificador de imagem',
    lido?.length === 32 * 18 && lido[0] === 120, `${lido?.length} pixels`);

  registrar('miniatura pela metade é ignorada em vez de virar movimento falso',
    lerPgm(pgm(32, 18, 7).subarray(0, 200)) === null,
    'o arquivo é reescrito o tempo todo; leitura rasgada acontece');

  registrar('arquivo que não é PGM não derruba a leitura',
    lerPgm(Buffer.from('isso não é imagem nenhuma')) === null, 'devolve null');

  const comComentario = Buffer.concat([
    Buffer.from('P5\n# escrito pelo ffmpeg\n4 4\n255\n'), Buffer.alloc(16, 9)
  ]);
  registrar('cabeçalho com comentário é entendido',
    lerPgm(comComentario)?.length === 16, 'o formato permite comentário no meio do cabeçalho');
}

// ============================================================================
// 5) O FFMPEG DE VERDADE — a peça que não dá para conferir lendo
// ============================================================================
{
  const ffmpeg = (() => {
    try {
      const bruto = fs.readFileSync(path.join(RAIZ, 'node_modules/ffmpeg-static/package.json'), 'utf8');
      const nome = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
      const candidato = path.join(RAIZ, 'node_modules/ffmpeg-static', nome);
      if (JSON.parse(bruto) && fs.existsSync(candidato)) return candidato;
    } catch { /* cai para o do sistema */ }
    return 'ffmpeg';
  })();

  const miniatura = path.join(pastaTemp, 'movimento.pgm');
  /**
   * Mesma forma de argumento do código de produção, trocando só a entrada: no lugar do RTSP da
   * câmera, uma fonte sintética que se mexe. É o que permite conferir o que importa aqui — que o
   * ffmpeg aceita DUAS saídas do mesmo fluxo, uma pelo cano e outra em arquivo.
   */
  const processo = spawn(ffmpeg, [
    '-nostdin', '-loglevel', 'error',
    // A duração vai DENTRO da fonte, e não como "-t 3" depois do "-i".
    // Motivo, descoberto travando este próprio conferidor: opção posicionada antes de um arquivo
    // de saída pertence ÀQUELA saída. Um "-t 3" ali limita só a primeira (o cano) — a segunda,
    // a miniatura, continuaria rodando para sempre. Encerrando a ENTRADA, as duas terminam juntas.
    // "-re" faz a fonte sintética correr em TEMPO REAL, como uma câmera.
    // Sem ele o ffmpeg processa os 3 segundos em 0,2s e o conferidor nunca chega a ver a
    // miniatura sendo reescrita — deu falha falsa dizendo que ela não era gerada, quando era.
    // A produção não precisa disto: RTSP já chega em tempo real, por natureza.
    '-re', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=3',
    '-an',
    '-f', 'mjpeg', '-q:v', '7', '-vf', 'fps=8,scale=640:-2', 'pipe:1',
    '-f', 'image2', '-update', '1', '-pix_fmt', 'gray', '-vf', 'fps=2,scale=32:18', '-y', miniatura
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let acumulado = Buffer.alloc(0);
  const quadros = [];
  const miniaturasLidas = [];
  processo.stdout.on('data', (pedaco) => {
    const r = extrairQuadros(acumulado, pedaco);
    acumulado = r.resto;
    quadros.push(...r.quadros);
  });
  let erroDoFfmpeg = '';
  processo.stderr.on('data', (d) => { erroDoFfmpeg += String(d); });

  const relogio = setInterval(() => {
    try {
      const lido = lerPgm(fs.readFileSync(miniatura));
      if (lido) miniaturasLidas.push(lido);
    } catch { /* ainda não existe */ }
  }, 200);

  // Rede de segurança: um conferidor que trava é pior que um que falha, porque não diz nada.
  const prazo = setTimeout(() => { try { processo.kill('SIGKILL'); } catch { /* já morreu */ } }, 60_000);
  const codigo = await new Promise((resolve) => {
    processo.on('error', () => resolve(-1));
    processo.on('close', resolve);
  });
  clearTimeout(prazo);
  clearInterval(relogio);

  if (codigo === -1) {
    registrar('o ffmpeg empacotado está disponível para conferir o caminho do vídeo', false,
      'ffmpeg não encontrado — rode npm install e tente de novo');
  } else {
    registrar('o ffmpeg aceita as duas saídas do mesmo fluxo',
      codigo === 0, codigo === 0 ? 'saiu limpo' : `código ${codigo}: ${erroDoFfmpeg.trim().split('\n').pop()}`);

    registrar('sai JPEG de verdade pelo cano, e o corte devolve quadros inteiros',
      quadros.length > 5 && quadros.every(q => q[0] === 0xff && q[1] === 0xd8 && q[q.length - 1] === 0xd9),
      `${quadros.length} quadros lidos`);

    registrar('a miniatura sai no formato que o detector de movimento espera',
      miniaturasLidas.length > 0 && miniaturasLidas.every(m => m.length === 32 * 18),
      `${miniaturasLidas.length} leitura(s) de 32x18`);

    /**
     * A fonte sintética muda a cada quadro, então DEVE haver diferença entre miniaturas. Se todas
     * saíssem iguais, o detector nunca acusaria movimento nenhum e o recurso pareceria funcionar
     * enquanto não registrava nada — a pior falha possível num sistema de vigilância.
     */
    const diferentes = miniaturasLidas.some((m, i) =>
      i > 0 && m.some((valor, pos) => Math.abs(valor - miniaturasLidas[i - 1][pos]) > 3));
    registrar('miniaturas de uma cena em movimento saem diferentes entre si',
      miniaturasLidas.length < 2 || diferentes,
      miniaturasLidas.length < 2 ? 'poucas leituras para comparar' : 'o detector tem o que comparar');
  }
}

// ============================================================================
// 6) A TELA PARA DE PERGUNTAR QUANDO PERGUNTAR NÃO ADIANTA
// ============================================================================
/**
 * O defeito que este bloco vigia apareceu em produção e é fácil de repetir sem querer: a tela
 * relia a lista de 5 em 5 segundos e engolia o erro em silêncio. No site publicado, onde o
 * servidor NÃO tem como alcançar a rede de casa, isso virou centenas de pedidos fracassados no
 * console e nenhuma explicação na tela — barulhento por dentro e mudo por fora.
 *
 * Contar pedidos é a única forma honesta de conferir isto: o comportamento errado e o certo
 * mostram exatamente a mesma tela, e só se distinguem por quantas vezes bateram no servidor.
 */
{
  const { build: construir } = await import('esbuild');
  const paginaJs = path.join(pastaDoBundle, 'painel.js');
  const entrada = path.join(pastaDoBundle, 'entrada.tsx');
  fs.writeFileSync(entrada, `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { CamerasSection } from ${JSON.stringify(path.join(RAIZ, 'src/components/CamerasSection.tsx'))};
    createRoot(document.getElementById('raiz')).render(
      React.createElement(CamerasSection, { onBack: () => {}, onNotification: () => {} })
    );
  `);
  await construir({
    entryPoints: [entrada], bundle: true, format: 'iife', outfile: paginaJs,
    absWorkingDir: RAIZ, logLevel: 'silent', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' }
  });

  const contarPedidos = async (responder) => {
    let pedidos = 0;
    const servidor = http.createServer((req, res) => {
      if (req.url.startsWith('/api/')) { pedidos++; return responder(req, res); }
      if (req.url === '/painel.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        return fs.createReadStream(paginaJs).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><div id="raiz"></div><script src="/painel.js"></script>');
    });
    await new Promise(r => servidor.listen(4388, '127.0.0.1', r));

    const perfil = fs.mkdtempSync(path.join(pastaTemp, 'perfil-'));
    const navegador = spawn('/opt/pw-browsers/chromium', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      `--user-data-dir=${perfil}`, 'http://127.0.0.1:4388/'
    ], { stdio: 'ignore' });

    // 22 segundos cobrem quatro janelas da releitura de 5s: se ela continuasse, daria mais de
    // oito pedidos. É o intervalo mínimo em que "parou" e "não parou" não se confundem.
    await new Promise(r => setTimeout(r, 22_000));
    try { navegador.kill('SIGKILL'); } catch { /* já morreu */ }
    await new Promise(r => servidor.close(r));
    return pedidos;
  };

  if (!fs.existsSync('/opt/pw-browsers/chromium')) {
    console.log('  (pulado) sem Chromium para conferir a releitura da tela.');
  } else {
    const comRecusaDefinitiva = await contarPedidos((req, res) => {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'As câmeras não funcionam nesta implantação.', unavailableOnVercel: true }));
    });
    registrar('resposta "aqui isso não existe" faz a tela parar de perguntar na hora',
      comRecusaDefinitiva <= 2,
      `${comRecusaDefinitiva} pedido(s) em 22s (a releitura de 5s daria 8 ou mais)`);

    // Erro 500, e não conexão derrubada: derrubar o socket faz o próprio navegador repetir o
    // pedido por conta dele, e a contagem passaria a medir a retentativa do Chromium em vez da
    // insistência da tela. 500 é também o que a pessoa viu no console em produção.
    const comServidorCaido = await contarPedidos((req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'falha do servidor' }));
    });
    // Três rodadas de duas chamadas cada. Sem a desistência seriam cinco rodadas (dez pedidos)
    // nesta janela, e o número seguiria crescendo enquanto a tela ficasse aberta.
    registrar('servidor fora do ar faz a tela desistir depois de três tentativas',
      comServidorCaido <= 6,
      `${comServidorCaido} pedido(s) em 22s (sem desistir seriam 10, e subindo)`);
  }
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
fs.rmSync(pastaDoBundle, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências das câmeras passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
