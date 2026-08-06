/**
 * Confere como um caminho pedido em português vira um caminho real deste computador.
 *
 * Três erros relatados em uso, todos aqui:
 *
 *   1. "Pedi home/usuario/downloads e ele foi procurar em .../OSONE-AI/downloads."
 *      Um caminho sem a barra inicial é relativo, e relativo é relativo a ALGUMA COISA. Sem
 *      ninguém decidir a quê, acabava relativo à pasta onde o programa roda — a pasta do próprio
 *      OSONE. Daí o nome do app aparecer no meio de um caminho que ninguém escreveu assim.
 *   2. "Ele pede Downloads e o sistema nega o acesso."
 *      No Linux 'downloads' e 'Downloads' são pastas diferentes. O erro que volta é "não existe",
 *      que soa como permissão e manda investigar o lugar errado.
 *   3. "Ele tenta abrir caminho de Windows num Linux."
 *      C:\\Users\\Fulano\\Downloads não é inválido: é de OUTRO sistema.
 *
 * O disco é de mentira de propósito. Um teste que perguntasse ao disco real passaria ou falharia
 * conforme as pastas de quem está rodando — e o que se quer fixar é a REGRA, não a máquina.
 *
 * Como rodar:
 *   node scripts/conferir-caminho-do-sistema.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-caminho-'));
const saida = path.join(pastaTemp, 'caminho.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/caminhoDoSistema.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { resolverCaminho, consertarCaixa, traduzirDeOutroSistema, ehAbsoluto } =
  await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/** Um disco de mentira: as pastas exatas do relato, com a caixa exata que elas têm no Linux. */
const PASTAS_LINUX = [
  '/home',
  '/home/usuario',
  '/home/usuario/Downloads',
  '/home/usuario/Documentos',
  '/home/usuario/Área de Trabalho',
  '/home/usuario/Imagens',
  '/home/usuario/OSONE-AI',
  '/home/usuario/OSONE-AI/dist',
  '/home/usuario/projetos',
  '/mnt/dados',
  '/opt/coisas'
];

const discoLinux = {
  casa: '/home/usuario',
  ehWindows: false,
  existe: (c) => PASTAS_LINUX.includes(String(c).replace(/\/+$/, '') || '/') || c === '/',
  listar: (pasta) => {
    const p = String(pasta).replace(/\/+$/, '') || '/';
    const prefixo = p === '/' ? '/' : `${p}/`;
    return PASTAS_LINUX
      .filter(x => x.startsWith(prefixo) && x !== p)
      .map(x => x.slice(prefixo.length))
      .filter(x => x && !x.includes('/'));
  }
};

const PASTAS_WINDOWS = ['C:\\Users\\Fulano', 'C:\\Users\\Fulano\\Downloads', 'C:\\Users\\Fulano\\Documents'];
const discoWindows = {
  casa: 'C:\\Users\\Fulano',
  ehWindows: true,
  existe: (c) => PASTAS_WINDOWS.includes(String(c).replace(/\\+$/, '')),
  listar: () => []
};

const APELIDOS = {
  downloads: ['Downloads', 'Descargas', 'Transferências'],
  desktop: ['Desktop', 'Área de Trabalho'],
  documents: ['Documents', 'Documentos'],
  pictures: ['Pictures', 'Imagens'],
  home: ['']
};

const resolver = (pedido, disco = discoLinux) => resolverCaminho(pedido, disco, { apelidosDePastas: APELIDOS });

// ============================================================================
// 1) O ERRO DO RELATO: A PASTA DO APP NO MEIO DO CAMINHO
// ============================================================================
{
  const r = resolver('home/usuario/downloads');
  registrar('"home/usuario/downloads" vira "/home/usuario/Downloads"',
    r.caminho === '/home/usuario/Downloads' && r.existe, r.caminho);

  registrar('o nome do app NUNCA aparece num caminho que ninguém escreveu assim',
    !r.caminho.includes('OSONE'), r.caminho);

  registrar('o ajuste é contado, em vez de acontecer em silêncio',
    r.comoResolveu.length > 10 && r.comoResolveu.includes('home/usuario/downloads'),
    r.comoResolveu);

  // Um relativo comum continua sendo relativo à PASTA PESSOAL, nunca à do app.
  const rel = resolver('projetos');
  registrar('caminho relativo resolve a partir da pasta pessoal',
    rel.caminho === '/home/usuario/projetos' && rel.existe, rel.caminho);

  const inexistente = resolver('uma-pasta-que-nao-existe');
  registrar('relativo inexistente também aponta para a pasta pessoal, e não para a do app',
    inexistente.caminho === '/home/usuario/uma-pasta-que-nao-existe' && !inexistente.existe,
    inexistente.caminho);
}

{
  const raizes = [
    ['mnt/dados', '/mnt/dados'],
    ['opt/coisas', '/opt/coisas'],
    ['home/usuario/Documentos', '/home/usuario/Documentos']
  ];
  const certos = raizes.filter(([pedido, esperado]) => resolver(pedido).caminho === esperado);
  registrar('outras raízes do sistema sem barra também são entendidas',
    certos.length === raizes.length, `${certos.length}/${raizes.length}`);
}

// ============================================================================
// 2) MAIÚSCULA E MINÚSCULA: O "ACESSO NEGADO" QUE NÃO ERA PERMISSÃO
// ============================================================================
{
  const r = resolver('/home/usuario/downloads');
  registrar('"downloads" em minúscula acha a pasta "Downloads"',
    r.caminho === '/home/usuario/Downloads' && r.existe, r.caminho);

  const acentuada = resolver('/home/usuario/área de trabalho');
  registrar('pasta com acento e espaço também é achada com a caixa errada',
    acentuada.caminho === '/home/usuario/Área de Trabalho' && acentuada.existe, acentuada.caminho);

  const doTil = resolver('~/documentos');
  registrar('o mesmo vale para caminho com "~"',
    doTil.caminho === '/home/usuario/Documentos' && doTil.existe, doTil.caminho);

  registrar('o conserto de caixa é contado a quem acompanha',
    /Ajustei maiúsculas/i.test(r.comoResolveu), r.comoResolveu);

  const naoExiste = consertarCaixa('/home/usuario/nao-existe-mesmo', discoLinux);
  registrar('o que não existe em nenhuma caixa não é inventado',
    naoExiste === null, 'devolve null em vez de um caminho de mentira');

  // O conserto não pode casar pasta ERRADA: 'dist' e 'Downloads' não têm nada a ver.
  const preciso = consertarCaixa('/home/usuario/DIST', discoLinux);
  registrar('o conserto casa só o nome equivalente, e não qualquer vizinho',
    preciso === null, `resultado: ${preciso}`);
}

// ============================================================================
// 3) CAMINHO DE OUTRO SISTEMA
// ============================================================================
{
  const r = resolver('C:\\Users\\Fulano\\Downloads');
  registrar('caminho de Windows num Linux vira a pasta pessoal daqui',
    r.caminho === '/home/usuario/Downloads', r.caminho);

  registrar('a tradução é explicada, dizendo que era caminho de Windows',
    /caminho de Windows/i.test(r.comoResolveu), r.comoResolveu.slice(0, 80));

  const semEquivalente = resolver('D:\\Projetos');
  registrar('unidade sem equivalente não é inventada, e o erro explica o que fazer',
    !semEquivalente.existe && /letras de unidade/i.test(semEquivalente.comoResolveu),
    semEquivalente.comoResolveu.slice(0, 90));

  const noWindows = resolverCaminho('/home/usuario/Downloads', discoWindows, { apelidosDePastas: APELIDOS });
  registrar('caminho de Linux num Windows vira a pasta pessoal de lá',
    noWindows.caminho === 'C:\\Users\\Fulano\\Downloads' && noWindows.existe, noWindows.caminho);

  registrar('a tradução ao contrário também é explicada',
    /caminho de Linux/i.test(noWindows.comoResolveu), noWindows.comoResolveu.slice(0, 70));

  registrar('num Windows, um caminho de Windows passa intacto',
    resolverCaminho('C:\\Users\\Fulano\\Documents', discoWindows, {}).caminho === 'C:\\Users\\Fulano\\Documents',
    'nada é reescrito à toa');

  registrar('o que é absoluto depende do sistema',
    ehAbsoluto('/home/x', false) && !ehAbsoluto('C:\\x', false)
      && ehAbsoluto('C:\\x', true) && !ehAbsoluto('/home/x', true),
    'cada sistema tem a sua ideia de raiz');

  registrar('num Linux, texto comum não é confundido com caminho de outro sistema',
    traduzirDeOutroSistema('Downloads', discoLinux) === null, 'só traduz o que é mesmo de outro sistema');
}

// ============================================================================
// 4) O NOME DA PASTA NO IDIOMA DA MÁQUINA
// ============================================================================
{
  const r = resolver('downloads');
  registrar('o apelido "downloads" acha a pasta real',
    r.caminho === '/home/usuario/Downloads' && r.existe, r.caminho);

  const doc = resolver('documents');
  registrar('"documents" acha "Documentos" numa máquina em português',
    doc.caminho === '/home/usuario/Documentos' && doc.existe, doc.caminho);

  registrar('quando o nome real é outro, isso é dito',
    /se chama "Documentos"/.test(doc.comoResolveu), doc.comoResolveu);

  const mesa = resolver('desktop');
  registrar('"desktop" acha "Área de Trabalho"',
    mesa.caminho === '/home/usuario/Área de Trabalho' && mesa.existe, mesa.caminho);

  const casa = resolver('~');
  registrar('"~" é a pasta pessoal', casa.caminho === '/home/usuario', casa.caminho);

  const vazio = resolver('');
  registrar('caminho vazio vira a pasta pessoal, e não a pasta do app',
    vazio.caminho === '/home/usuario', vazio.caminho);
}

// ============================================================================
// 5) O QUE JÁ ESTAVA CERTO CONTINUA CERTO
// ============================================================================
{
  const r = resolver('/home/usuario/Downloads');
  registrar('caminho absoluto correto passa intacto e sem explicação sobrando',
    r.caminho === '/home/usuario/Downloads' && r.comoResolveu === '', 'nada é reescrito à toa');

  const app = resolver('/home/usuario/OSONE-AI/dist');
  registrar('quem realmente PEDE a pasta do app continua podendo',
    app.caminho === '/home/usuario/OSONE-AI/dist' && app.existe,
    'a regra impede o app entrar sozinho, não impede pedir por ele');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
