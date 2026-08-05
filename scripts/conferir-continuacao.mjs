/**
 * Confere que o servidor manda o modelo TERMINAR o que começou (server.ts).
 *
 * Este é o conserto do relato "o código não está sendo finalizado". Um pedido de jogo completo em
 * HTML não cabe numa resposta só: o modelo escreve até o limite de tokens de saída e para no
 * meio, e a API sinaliza isso com finishReason 'MAX_TOKENS'. Como não é erro, nada tentava de
 * novo — o servidor devolvia o pedaço e o app gravava o pedaço.
 *
 * A saída é mandar o modelo continuar de onde parou, quantas vezes forem necessárias, e emendar.
 * O que se verifica aqui é a máquina dessa emenda, rodando o código de verdade do server.ts
 * contra um modelo de mentira que devolve respostas combinadas. O modelo real é o que menos
 * importa neste caminho: o que pode dar errado é o laço parar cedo demais, não parar nunca,
 * duplicar o trecho que o modelo repete ao retomar, ou perder o texto já escrito quando a
 * continuação falha.
 *
 * Como rodar:
 *   node scripts/conferir-continuacao.mjs
 */
import { transform } from 'esbuild';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'server.ts'), 'utf-8');

// O bloco de continuação é recortado do server.ts e rodado como está: o que se confere é o código
// que vai para produção, não uma cópia dele que pode envelhecer sem ninguém notar.
const INICIO = "  function normalizarTurnos(";
const FIM = "    return { texto, finishReason, continuacoes, modeloUsado, bloqueado };\n  }";
const i = fonte.indexOf(INICIO);
const f = fonte.indexOf(FIM);
if (i === -1 || f === -1) {
  console.error('Não foi possível recortar o bloco de continuação do server.ts. Os marcadores mudaram?');
  process.exit(2);
}
const blocoTs = fonte.slice(i, f + FIM.length);

// 'GoogleGenAI' só aparece como tipo na assinatura; o corpo nunca toca no SDK.
const moduloTs = `
type GoogleGenAI = any;
let __chamadas: any[] = [];
let __respostas: any[] = [];
async function generateContentWithFallback(ai: any, params: any, options?: any) {
  __chamadas.push(params);
  const proxima = __respostas.shift();
  if (!proxima) throw new Error('o teste acabou as respostas combinadas');
  if (proxima.erro) throw new Error(proxima.erro);
  const r: any = {
    text: proxima.text,
    candidates: [{ finishReason: proxima.finishReason }]
  };
  r.__modeloUsado = proxima.modelo || params.model;
  return r;
}
${blocoTs}
export { gerarConteudoAteOFim, emendarContinuacao, normalizarTurnos };
export function prepararRespostas(rs: any[]) { __respostas = rs; __chamadas = []; }
export function chamadasFeitas() { return __chamadas; }
`;

const { code } = await transform(moduloTs, { loader: 'ts', format: 'esm' });
const modulo = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { gerarConteudoAteOFim, prepararRespostas, chamadasFeitas } = modulo;

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const params = { model: 'gemini-3.6-flash', contents: 'faça um jogo', config: { responseMimeType: 'application/json' } };
const comContinuacoes = { maximoDeContinuacoes: 4 };

// ====== 1) O CASO RELATADO: a resposta acaba no meio e precisa ser terminada ======
{
  prepararRespostas([
    { text: '<!DOCTYPE html>\n<html><body><script>let vidas = 3;', finishReason: 'MAX_TOKENS' },
    { text: '\nlet pontos = 0;</script></body></html>', finishReason: 'STOP' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('resposta cortada é continuada até fechar, e o texto final é o arquivo inteiro',
    r.texto.endsWith('</html>') && r.finishReason === 'STOP' && r.continuacoes === 1,
    `${r.continuacoes} continuação(ões), finishReason=${r.finishReason}`);
}

// ====== 2) VÁRIOS CORTES SEGUIDOS: continua até acabar, não só uma vez ======
{
  prepararRespostas([
    { text: 'parte1', finishReason: 'MAX_TOKENS' },
    { text: 'parte2', finishReason: 'MAX_TOKENS' },
    { text: 'parte3', finishReason: 'MAX_TOKENS' },
    { text: 'fim', finishReason: 'STOP' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('vários cortes seguidos são emendados até o modelo chegar ao fim',
    r.texto === 'parte1parte2parte3fim' && r.continuacoes === 3, r.texto);
}

// ====== 3) O LAÇO PRECISA TER FIM: teto de continuações respeitado ======
{
  prepararRespostas(Array.from({ length: 10 }, (_, n) => ({ text: `p${n}`, finishReason: 'MAX_TOKENS' })));
  const r = await gerarConteudoAteOFim({}, params, { maximoDeContinuacoes: 2 });
  registrar('o teto de continuações é respeitado e o corte é reportado como corte',
    r.continuacoes === 2 && r.finishReason === 'MAX_TOKENS',
    `${r.continuacoes} continuações, finishReason=${r.finishReason}`);
}

// ====== 4) O QUE JÁ FOI ESCRITO NÃO SE PERDE SE A CONTINUAÇÃO FALHAR ======
{
  prepararRespostas([
    { text: 'metade do jogo', finishReason: 'MAX_TOKENS' },
    { erro: '503 UNAVAILABLE' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('falha ao continuar entrega o que já existia, em vez de perder tudo',
    r.texto === 'metade do jogo' && r.finishReason === 'MAX_TOKENS', JSON.stringify(r.texto));
}

{
  prepararRespostas([
    { text: 'metade do jogo', finishReason: 'MAX_TOKENS' },
    { text: '   ', finishReason: 'STOP' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('continuação vazia não apaga o texto nem trava o laço',
    r.texto === 'metade do jogo', JSON.stringify(r.texto));
}

// ====== 5) O MODELO REPETE AS ÚLTIMAS LINHAS AO RETOMAR — E ISSO NÃO PODE DUPLICAR ======
{
  prepararRespostas([
    { text: 'function desenhar() {\n  ctx.fillRect(0, 0, 10, 10);', finishReason: 'MAX_TOKENS' },
    { text: '  ctx.fillRect(0, 0, 10, 10);\n}\n', finishReason: 'STOP' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  const vezes = r.texto.split('ctx.fillRect').length - 1;
  registrar('o trecho repetido pelo modelo ao retomar não é duplicado no arquivo',
    vezes === 1, `"ctx.fillRect" aparece ${vezes}x`);
}

// ====== 6) A CERCA DE MARKDOWN QUE O MODELO REABRE NÃO ENTRA NO CÓDIGO ======
{
  prepararRespostas([
    { text: '<html><body>', finishReason: 'MAX_TOKENS' },
    { text: '```html\n</body></html>', finishReason: 'STOP' }
  ]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('cerca de markdown reaberta na continuação não vira código',
    !r.texto.includes('```') && r.texto.endsWith('</html>'), JSON.stringify(r.texto));
}

// ====== 7) A CONTINUAÇÃO PEDE TEXTO, NÃO UM JSON NOVO ======
// Exigir de novo um JSON completo faria o modelo RECOMEÇAR o documento em vez de completar a
// metade que ficou — e aí não haveria como juntar as duas metades.
{
  prepararRespostas([
    { text: '{"gdd": "um jogo', finishReason: 'MAX_TOKENS' },
    { text: ' de nave"}', finishReason: 'STOP' }
  ]);
  await gerarConteudoAteOFim({}, params, comContinuacoes);
  const chamadas = chamadasFeitas();
  const primeira = chamadas[0].config?.responseMimeType;
  const continuacao = chamadas[1].config?.responseMimeType;
  registrar('a continuação não repete o formato JSON obrigatório do primeiro turno',
    primeira === 'application/json' && continuacao === undefined,
    `1ª=${primeira}, continuação=${continuacao}`);
}

{
  const chamadas = chamadasFeitas();
  const turnos = chamadas[1].contents;
  const temPedidoOriginal = JSON.stringify(turnos).includes('faça um jogo');
  const temRespostaParcial = turnos.some(t => t.role === 'model');
  const ultimoEhUsuario = turnos[turnos.length - 1].role === 'user';
  registrar('a continuação leva o pedido original, a resposta parcial e a ordem de continuar',
    temPedidoOriginal && temRespostaParcial && ultimoEhUsuario,
    `${turnos.length} turnos enviados`);
}

// ====== 8) SEM CORTE, NADA DE CHAMADA EXTRA ======
{
  prepararRespostas([{ text: 'código inteiro de primeira', finishReason: 'STOP' }]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('resposta que já veio inteira não gera chamada extra nenhuma',
    r.continuacoes === 0 && chamadasFeitas().length === 1,
    `${chamadasFeitas().length} chamada(s)`);
}

// ====== 9) RESPOSTA BLOQUEADA NÃO É CORTE: insistir seria queimar cota à toa ======
{
  prepararRespostas([{ text: '', finishReason: 'SAFETY' }]);
  const r = await gerarConteudoAteOFim({}, params, comContinuacoes);
  registrar('resposta bloqueada pelo filtro é reportada e não vira pedido de continuação',
    r.bloqueado === true && r.continuacoes === 0 && chamadasFeitas().length === 1,
    `bloqueado=${r.bloqueado}, ${chamadasFeitas().length} chamada(s)`);
}

// ====== 10) FORA DA GERAÇÃO DE CÓDIGO, O COMPORTAMENTO ANTIGO CONTINUA ======
{
  prepararRespostas([{ text: 'pedaço', finishReason: 'MAX_TOKENS' }]);
  const r = await gerarConteudoAteOFim({}, params, { maximoDeContinuacoes: 0 });
  registrar('sem continuações permitidas, devolve o pedaço e o corte, sem chamada extra',
    r.continuacoes === 0 && r.finishReason === 'MAX_TOKENS' && chamadasFeitas().length === 1,
    `${chamadasFeitas().length} chamada(s)`);
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
