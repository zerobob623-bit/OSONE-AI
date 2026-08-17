/**
 * Confere o motor de ações do PC: 'localizar' deixa de travar tudo o mais e deixa de poder
 * ficar preso por 2 minutos.
 *
 * O RELATO foi "ele fica preso em uma ação por vez e às vezes fica 2 minutos caçando na tela...
 * faz ele conseguir encerrar ação e iniciar a próxima que ele quiser". A causa dos 2 minutos:
 * mirarPorVisao fazia um único fetch, sem AbortController e sem timeout — se o modelo de visão
 * demorasse, nada cortava a espera. E como o motor tinha UMA AÇÃO POR VEZ irrestrita, aquele
 * fetch sem teto travava toda ação seguinte, mesmo as que não tinham nada a ver com a busca.
 *
 * A correção NÃO libera tudo ao mesmo tempo — mouse e teclado continuam de um por vez, porque
 * dois cliques simultâneos disputariam o mesmo cursor de verdade. 'localizar' é a exceção seura
 * porque é só uma pergunta de leitura ao modelo de visão, sem efeito na máquina: ganhou teto de
 * tempo (25s) e cancelamento por uma ação nova, e em troca não trava mais o resto.
 *
 * Como rodar:
 *   node scripts/conferir-motor-cancelavel.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(RAIZ, '.tmp-motor-'));

let ok = 0, falhou = 0;
const conferir = (nome, cond, detalhe = '') => {
  if (cond) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} ${detalhe}`); }
};

// ---------------------------------------------------------------------------
// 1. mirarPorVisao tem teto de tempo e responde a cancelamento — com relógio real.
// ---------------------------------------------------------------------------
console.log('\n=== mirarPorVisao.ts: TETO DE TEMPO E CANCELAMENTO ===');

const saidaVisao = path.join(pastaTemp, 'visao.mjs');
await build({
  entryPoints: [path.join(RAIZ, 'src/lib/mirarPorVisao.ts')],
  bundle: true, format: 'esm', outfile: saidaVisao, logLevel: 'silent'
});
const { mirarPorVisao } = await import('file://' + saidaVisao);

// fetch que nunca resolve sozinho — só reage ao abort do signal, como uma API real travada faria.
global.fetch = (url, opts) => new Promise((resolve, reject) => {
  opts?.signal?.addEventListener('abort', () => {
    const erro = new Error('The operation was aborted.');
    erro.name = 'AbortError';
    reject(erro);
  });
});

// O teto de 25s em si é conferido por leitura do código logo abaixo (esperar 25s de verdade
// aqui deixaria este teste lento sem motivo — o que importa testar com relógio real é a reação
// RÁPIDA ao cancelamento, que é o caminho que o usuário realmente sente).

// Cancelamento explícito (uma ação nova chegando) — precisa ser quase instantâneo,
// não esperar o teto de 25s.
const controleExterno = new AbortController();
const antesDoCancelamento = Date.now();
const promessaCancelavel = mirarPorVisao('outro botão', 'ZmFrZQ==', 'image/png', '', 'gemini-3.7-flash', controleExterno.signal);
setTimeout(() => controleExterno.abort(), 50);
const resultadoCancelado = await promessaCancelavel;
const duracaoDoCancelamento = Date.now() - antesDoCancelamento;

conferir('cancelamento externo interrompe na hora, sem esperar o teto',
  duracaoDoCancelamento < 2000, `levou ${duracaoDoCancelamento}ms`);
conferir('o motivo diz que outra ação assumiu, não confunde com falha de rede',
  /outra ação começou/.test(resultadoCancelado.motivo || ''), resultadoCancelado.motivo);

// ---------------------------------------------------------------------------
// 2. As travas certas estão no código real (useLocalAgent.ts).
// ---------------------------------------------------------------------------
console.log('\n=== TRAVAS NO CÓDIGO REAL (src/hooks/useLocalAgent.ts) ===');
const fonte = fs.readFileSync(path.join(RAIZ, 'src/hooks/useLocalAgent.ts'), 'utf8');

conferir("'localizar' fica de fora da trava de uma-ação-por-vez",
  /if \(!ehBuscaNaTela && emExecucaoRef\.current\)/.test(fonte));
conferir("uma ação nova cancela a busca na tela pendente ANTES de checar a trava",
  fonte.indexOf('buscaNaTelaAbortRef.current.abort()') < fonte.indexOf('if (!ehBuscaNaTela && emExecucaoRef.current)'));
conferir("mouse/teclado/terminal continuam sob a trava normal (não é 'libera tudo')",
  /if \(!ehBuscaNaTela\) emExecucaoRef\.current = rotularAcao/.test(fonte));
conferir("o sinal da busca é passado para mirarPorVisao (não só criado à toa)",
  /mirarPorVisao\(\s*procurado,[\s\S]{0,200}controleDaBusca\.signal/.test(fonte));
conferir("a referência só é limpa se ainda for a MESMA busca (evita apagar a de uma ação nova)",
  /if \(buscaNaTelaAbortRef\.current === controleDaBusca\) buscaNaTelaAbortRef\.current = null;/.test(fonte));

console.log('\n=== TETO DE TEMPO (src/lib/mirarPorVisao.ts) ===');
const fonteVisao = fs.readFileSync(path.join(RAIZ, 'src/lib/mirarPorVisao.ts'), 'utf8');
const teto = Number((fonteVisao.match(/const TETO_MS = (\d+);/) || [])[1]);
conferir('existe um teto declarado', Number.isFinite(teto) && teto > 0, `TETO_MS=${teto}`);
conferir('o teto é bem menor que os "2 minutos" relatados (fica abaixo de 30s)',
  teto > 0 && teto <= 30000, `${teto}ms`);
conferir('o teto vale mesmo sem sinal externo (todo chamador ganha o corte, não só localizar)',
  /const controle = new AbortController\(\);\s*\n\s*const TETO_MS/.test(fonteVisao));

fs.rmSync(pastaTemp, { recursive: true, force: true });
console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou > 0 ? 1 : 0);
