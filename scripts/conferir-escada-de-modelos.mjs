/**
 * Confere a escada de modelos do servidor — por que o OSONE CODE parava enquanto a escrita ia.
 *
 * O caso real, visto num print do terminal do usuário:
 *
 *   Trying Gemini code stream      (Model: gemini-3.6-flash)      ← OSONE CODE
 *   Trying Gemini content generation (Model: gemini-3.6-flash)    ← aba de escrita
 *   Trying Gemini content generation (Model: gemini-3.5-flash-lite) ← e ENTREGOU
 *
 * A mesma chave, no mesmo instante: a aba de escrita caiu para o 'lite' e entregou o texto; o
 * OSONE CODE não entregou nada. A diferença estava aqui — a geração de código proibia modelos
 * 'lite' de forma ABSOLUTA, para a qualidade não cair sem o usuário saber. Numa chave de nível
 * gratuito, em que os modelos de ponta respondem com falta de cota, essa proibição virava pane
 * total: um cuidado com qualidade transformado em "o OSONE CODE está quebrado".
 *
 * O que se confere aqui: os 'lite' entram, mas SÓ no fim da fila; a ordem de preferência não
 * mudou; e um modelo que acabou de recusar atendimento sai da frente, para o pedido seguinte não
 * pagar a mesma espera de novo — que é a outra metade do relato ("está demorando muito").
 *
 * Como rodar:
 *   node scripts/conferir-escada-de-modelos.mjs
 */
import { transform } from 'esbuild';
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'server.ts'), 'utf-8');

// O bloco é recortado do server.ts e rodado como está: o que se confere é o código que vai para
// produção, não uma cópia que pode envelhecer sem ninguém notar.
const INICIO = "  const EXTRAS_DA_GERACAO = ";
const FIM = "    return disponiveis.length > 0 ? disponiveis : unicos;\n  }";
const i = fonte.indexOf(INICIO);
const f = fonte.indexOf(FIM);
if (i === -1 || f === -1) {
  console.error('Não foi possível recortar a escada de modelos do server.ts. Os marcadores mudaram?');
  process.exit(2);
}

const moduloTs = `
${fonte.slice(i, f + FIM.length)}
export { listarModelosCandidatos, anotarIndisponivel, modelosIndisponiveis,
         configAceitavelPara, proximoExtraASacrificar, anotarExtraRecusado, ehPedidoInvalido,
         extrasRecusadosPorModelo, EXTRAS_DA_GERACAO };
`;

const { code } = await transform(moduloTs, { loader: 'ts', format: 'esm' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { listarModelosCandidatos, anotarIndisponivel, modelosIndisponiveis,
        configAceitavelPara, proximoExtraASacrificar, anotarExtraRecusado, ehPedidoInvalido,
        extrasRecusadosPorModelo } = mod;

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const ehLite = (m) => m.includes('-lite');
const paraCodigo = (reserva = '') =>
  listarModelosCandidatos('gemini-3.6-flash', { allowDowngrade: false, modeloDeReserva: reserva });

// ====== 1) O DEFEITO RELATADO: a geração de código precisa ter fundo de poço ======
{
  const lista = paraCodigo('gemini-3.6-flash');
  const temLite = lista.some(ehLite);
  registrar('a geração de código tem modelo de reserva até o fim da fila (não entrega vazio)',
    temLite, temLite ? lista.join(' → ') : 'NENHUM lite na fila: chave sem cota nos preferidos fica sem nada');
}

// ====== 2) MAS O 'LITE' É O ÚLTIMO RECURSO, NUNCA O PRIMEIRO ======
// Se ele subisse na fila, a qualidade do código cairia sem o usuário saber — que é exatamente a
// preocupação que originou a regra. O conserto não pode desfazer o motivo dela.
{
  const lista = paraCodigo('gemini-3.6-flash');
  const primeiroLite = lista.findIndex(ehLite);
  const ultimoNaoLite = lista.map(ehLite).lastIndexOf(false);
  registrar('os modelos lite ficam DEPOIS de todos os preferidos, nunca à frente',
    primeiroLite > ultimoNaoLite, lista.join(' → '));
}

{
  const lista = paraCodigo('');
  registrar('o modelo preferido continua sendo o primeiro da fila',
    lista[0] === 'gemini-3.6-flash', lista[0]);
}

// ====== 3) O MODELO DOS AJUSTES ENTRA ANTES DOS LITE ======
// É o único que se SABE que funciona com a chave da pessoa: tentar antes de rebaixar é o certo.
{
  const lista = paraCodigo('gemini-3.1-pro-preview');
  const posReserva = lista.indexOf('gemini-3.1-pro-preview');
  const primeiroLite = lista.findIndex(ehLite);
  registrar('o modelo configurado nos Ajustes é tentado antes de rebaixar para lite',
    posReserva !== -1 && posReserva < primeiroLite, lista.join(' → '));
}

// ====== 4) A ABA DE ESCRITA NÃO PODE TER REGREDIDO ======
{
  const lista = listarModelosCandidatos('gemini-3.6-flash', { allowDowngrade: true });
  registrar('o caminho que já podia rebaixar continua igual',
    lista[0] === 'gemini-3.6-flash' && lista.includes('gemini-3.5-flash-lite'),
    lista.join(' → '));
}

// ====== 5) "ESTÁ DEMORANDO MUITO": quem recusou sai da frente da fila ======
{
  modelosIndisponiveis.clear();
  const antes = paraCodigo('');
  anotarIndisponivel('gemini-3.6-flash', 'cota');
  const depois = paraCodigo('');
  registrar('modelo sem cota sai da fila, e o pedido seguinte não paga a mesma espera',
    antes[0] === 'gemini-3.6-flash' && depois[0] !== 'gemini-3.6-flash' && !depois.includes('gemini-3.6-flash'),
    `antes começava em ${antes[0]}, agora começa em ${depois[0]}`);
}

{
  modelosIndisponiveis.clear();
  anotarIndisponivel('gemini-3.6-flash', 'inexistente');
  const lista = paraCodigo('');
  registrar('modelo inexistente para a chave também sai da fila',
    !lista.includes('gemini-3.6-flash'), lista.join(' → '));
}

// ====== 6) MAS NUNCA FICAR SEM NENHUM CANDIDATO ======
// Se todos estiverem de castigo, tentar todos é melhor do que não tentar nenhum — ficar sem
// resposta é o desfecho que este arquivo inteiro existe para evitar.
{
  modelosIndisponiveis.clear();
  for (const m of paraCodigo('gemini-3.6-flash')) anotarIndisponivel(m, 'cota');
  const lista = paraCodigo('gemini-3.6-flash');
  registrar('com TODOS os modelos de castigo, a fila volta inteira em vez de ficar vazia',
    lista.length > 0 && lista[0] === 'gemini-3.6-flash',
    `${lista.length} candidato(s)`);
}

{
  // O castigo tem prazo: cota volta sozinha, e o modelo bom precisa voltar à frente da fila.
  modelosIndisponiveis.clear();
  modelosIndisponiveis.set('gemini-3.6-flash', Date.now() - 1);
  const lista = paraCodigo('');
  registrar('castigo vencido devolve o modelo preferido para a frente da fila',
    lista[0] === 'gemini-3.6-flash', lista[0]);
}

// ====== 7) O RELATO CENTRAL: a aba de escrita entrega e o OSONE CODE não ======
// As duas chamadas vão para a MESMA rota, com a MESMA chave. A diferença é que 'unrestricted'
// acrescenta três blocos ao config. Basta a API recusar UM deles para a geração de código morrer
// em todos os modelos, enquanto a aba de escrita — que não manda nenhum — segue funcionando.
{
  extrasRecusadosPorModelo.clear();

  // O pedido da geração de código, como o servidor monta hoje.
  const configDoCodigo = {
    systemInstruction: 'seja um programador',
    thinkingConfig: { thinkingLevel: 'HIGH' },
    maxOutputTokens: 32768,
    safetySettings: [{ category: 'X', threshold: 'BLOCK_NONE' }]
  };
  // O pedido da aba de escrita, que funciona: só a instrução.
  const configDaEscrita = { systemInstruction: 'seja um escritor' };

  const erroDeCampoInvalido = 'Invalid JSON payload received. Unknown name "thinkingLevel"';
  registrar('erro de campo inválido é reconhecido como pedido inválido (e não como cota)',
    ehPedidoInvalido(erroDeCampoInvalido) === true && ehPedidoInvalido('429 RESOURCE_EXHAUSTED quota') === false,
    'distingue pedido inválido de falta de cota');

  // Sacrifica um extra por vez, como o servidor faz ao receber o erro.
  const sacrificados = [];
  let atual = configDoCodigo;
  for (let i = 0; i < 5; i++) {
    const extra = proximoExtraASacrificar('gemini-3.6-flash', configDoCodigo);
    if (!extra) break;
    anotarExtraRecusado('gemini-3.6-flash', extra);
    sacrificados.push(extra);
    atual = configAceitavelPara('gemini-3.6-flash', configDoCodigo);
  }

  registrar('sacrificados todos os extras, o pedido do código vira IGUAL ao da aba de escrita',
    JSON.stringify(Object.keys(atual).sort()) === JSON.stringify(Object.keys(configDaEscrita).sort()),
    `sobrou { ${Object.keys(atual).join(', ')} } — a aba de escrita manda { ${Object.keys(configDaEscrita).join(', ')} }`);

  registrar('o sacrifício tem fim: três extras, e depois não há mais o que tirar',
    sacrificados.length === 3 && proximoExtraASacrificar('gemini-3.6-flash', configDoCodigo) === null,
    sacrificados.join(' → '));
}

{
  // O caminho não pode ser destrutivo: um modelo que recusa não estraga os outros.
  extrasRecusadosPorModelo.clear();
  const config = { systemInstruction: 'x', thinkingConfig: { thinkingLevel: 'HIGH' }, maxOutputTokens: 32768 };
  anotarExtraRecusado('gemini-3.6-flash', 'thinkingConfig');
  const doQueRecusou = configAceitavelPara('gemini-3.6-flash', config);
  const doOutro = configAceitavelPara('gemini-3.5-flash', config);
  registrar('o que um modelo recusa não é tirado dos outros',
    doQueRecusou.thinkingConfig === undefined && doOutro.thinkingConfig !== undefined,
    'o ajuste continua valendo nos modelos que o aceitam');
}

{
  // E a memória evita repetir a pergunta: o segundo pedido já sai enxuto.
  extrasRecusadosPorModelo.clear();
  const config = { systemInstruction: 'x', thinkingConfig: { thinkingLevel: 'HIGH' } };
  anotarExtraRecusado('gemini-3.6-flash', 'thinkingConfig');
  const segundoPedido = configAceitavelPara('gemini-3.6-flash', config);
  registrar('o pedido seguinte já sai sem o ajuste recusado, sem pagar o erro de novo',
    segundoPedido.thinkingConfig === undefined && segundoPedido.systemInstruction === 'x',
    'a instrução do sistema é preservada');
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
