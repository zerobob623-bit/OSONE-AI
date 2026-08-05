/**
 * Confere que o código aparece ENQUANTO é escrito (src/lib/gerarCodigoEmFluxo.ts).
 *
 * Relatado assim: "não quero que ele me entregue o texto no final, quero ver o texto sendo
 * escrito em tempo real". O caminho antigo só devolvia quando o modelo terminava — dezenas de
 * segundos de tela parada, sem como distinguir "está escrevendo" de "travou", e um pedido mal
 * entendido só se revelando no fim, com o tempo todo já gasto.
 *
 * O que se verifica aqui é o leitor do fluxo, que é onde as coisas silenciosamente dão errado:
 * um pedaço da rede corta um evento ao meio, um proxy entrega tudo colado, a conexão morre antes
 * do evento final, o servidor não sabe transmitir. Em nenhum desses casos pode sobrar menos
 * código do que sobraria sem a transmissão — a escrita ao vivo é um ganho, não um risco novo.
 *
 * Como rodar:
 *   node scripts/conferir-escrita-ao-vivo.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-ao-vivo-'));
const saida = path.join(pastaTemp, 'fluxo.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/gerarCodigoEmFluxo.ts')],
  bundle: true, format: 'esm', outfile: saida,
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});
const { gerarCodigoEmFluxo } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const codificador = new TextEncoder();

/** Um /api/generate-stream de mentira: entrega os blocos de bytes que o teste mandar. */
function servidorDeMentira(blocos, { status = 200, corpoNulo = false, erroNoMeio = false } = {}) {
  globalThis.fetch = async () => {
    if (status !== 200) {
      return {
        ok: false, status,
        json: async () => ({ error: `falha simulada ${status}` }),
        body: null
      };
    }
    if (corpoNulo) return { ok: true, status: 200, body: null, json: async () => ({}) };

    let i = 0;
    return {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            if (erroNoMeio && i === blocos.length) throw new Error('conexão caiu');
            if (i >= blocos.length) return { done: true, value: undefined };
            return { done: false, value: codificador.encode(blocos[i++]) };
          }
        })
      }
    };
  };
}

const evento = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

// ====== 1) O PEDIDO CENTRAL: os pedaços chegam durante a geração, não só no fim ======
{
  servidorDeMentira([
    evento({ modeloUsado: 'gemini-3.6-flash', modeloPreferido: 'gemini-3.6-flash' }),
    evento({ text: '<!DOCTYPE html>\n' }),
    evento({ text: '<html>\n' }),
    evento({ text: '</html>' }),
    evento({ done: true, text: '<!DOCTYPE html>\n<html>\n</html>', finishReason: 'STOP', continuacoes: 0 }),
    'data: [DONE]\n\n'
  ]);

  const vistos = [];
  const r = await gerarCodigoEmFluxo({}, { aoEscrever: (acumulado) => vistos.push(acumulado) });
  registrar('o texto chega em pedaços durante a geração, e não de uma vez só no fim',
    vistos.length === 3 && vistos[0] === '<!DOCTYPE html>\n' && vistos[2] === '<!DOCTYPE html>\n<html>\n</html>',
    `${vistos.length} atualizações de tela`);
  registrar('o texto final do servidor é o que vale para gravar no arquivo',
    r.texto === '<!DOCTYPE html>\n<html>\n</html>' && !r.truncated && r.fluxoDisponivel, r.texto.length + ' caracteres');
}

// ====== 2) A REDE NÃO RESPEITA FRONTEIRA DE EVENTO ======
// Um pedaço de bytes pode cortar o JSON ao meio; juntar errado aqui perderia texto em silêncio.
{
  const inteiro = evento({ text: 'parte A ' }) + evento({ text: 'parte B' }) + evento({ done: true, text: 'parte A parte B', finishReason: 'STOP' });
  const corte = Math.floor(inteiro.length / 2);
  servidorDeMentira([inteiro.slice(0, corte), inteiro.slice(corte), 'data: [DONE]\n\n']);

  const vistos = [];
  const r = await gerarCodigoEmFluxo({}, { aoEscrever: (a) => vistos.push(a) });
  registrar('evento cortado ao meio pela rede é remontado, sem perder texto',
    r.texto === 'parte A parte B' && vistos[vistos.length - 1] === 'parte A parte B',
    JSON.stringify(r.texto));
}

{
  // O contrário também acontece: vários eventos colados num pedaço só.
  servidorDeMentira([
    evento({ text: 'um ' }) + evento({ text: 'dois ' }) + evento({ text: 'três' }),
    evento({ done: true, text: 'um dois três', finishReason: 'STOP' })
  ]);
  const vistos = [];
  await gerarCodigoEmFluxo({}, { aoEscrever: (a) => vistos.push(a) });
  registrar('vários eventos colados num pedaço só são separados corretamente',
    vistos.length === 3 && vistos[2] === 'um dois três', `${vistos.length} atualizações`);
}

// ====== 3) A CONEXÃO CAIU ANTES DO FIM: o que já veio não pode ser jogado fora ======
{
  servidorDeMentira([
    evento({ text: 'metade do jogo' })
  ], { erroNoMeio: true });
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('conexão que cai no meio devolve o que já tinha chegado',
    r.texto === 'metade do jogo', JSON.stringify(r.texto));
}

{
  // Fluxo que termina sem o evento final (proxy cortou, servidor reiniciou).
  servidorDeMentira([evento({ text: 'só isto veio' })]);
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('fluxo que acaba sem o evento final aproveita o que chegou',
    r.texto === 'só isto veio', JSON.stringify(r.texto));
}

// ====== 4) SEM TRANSMISSÃO, O CHAMADOR PRECISA SABER QUE DEVE TENTAR O CAMINHO COMUM ======
// Perder a escrita ao vivo é um degrau abaixo; ficar sem código é o desfecho ruim de sempre.
{
  servidorDeMentira([], { status: 404 });
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('rota de transmissão ausente pede o caminho comum, em vez de falhar',
    r.fluxoDisponivel === false && !r.texto, `fluxoDisponivel=${r.fluxoDisponivel}`);
}

{
  servidorDeMentira([], { corpoNulo: true });
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('resposta sem corpo legível também cai para o caminho comum',
    r.fluxoDisponivel === false, `fluxoDisponivel=${r.fluxoDisponivel}`);
}

{
  // 400 é erro real do pedido (ex: chave ausente): repetir daria o mesmo erro.
  servidorDeMentira([], { status: 400 });
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('erro de pedido (400) não manda repetir pelo caminho comum',
    r.fluxoDisponivel === true && !!r.erro, r.erro);
}

// ====== 5) O ERRO VINDO DENTRO DO FLUXO É RELATADO ======
{
  servidorDeMentira([evento({ error: 'cota esgotada' }), 'data: [DONE]\n\n']);
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('erro anunciado dentro do fluxo vira erro para quem chamou',
    r.erro === 'cota esgotada' && !r.texto, r.erro);
}

// ====== 6) O CORTE E AS CONTINUAÇÕES CHEGAM À TELA ======
{
  servidorDeMentira([
    evento({ text: 'parte 1' }),
    evento({ continuando: 1 }),
    evento({ text: ' parte 2' }),
    evento({ done: true, text: 'parte 1 parte 2', finishReason: 'STOP', continuacoes: 1 }),
    'data: [DONE]\n\n'
  ]);
  const continuacoesVistas = [];
  const r = await gerarCodigoEmFluxo({}, { aoContinuar: (n) => continuacoesVistas.push(n) });
  registrar('o aviso de "mandando continuar" chega à tela durante a escrita',
    continuacoesVistas.length === 1 && continuacoesVistas[0] === 1 && r.continuacoes === 1,
    `${continuacoesVistas.length} aviso(s)`);
}

{
  servidorDeMentira([
    evento({ text: 'metade' }),
    evento({ done: true, text: 'metade', finishReason: 'MAX_TOKENS', truncated: true, continuacoes: 4 }),
    'data: [DONE]\n\n'
  ]);
  const r = await gerarCodigoEmFluxo({}, {});
  registrar('o corte que nem as continuações resolveram continua sendo relatado',
    r.truncated === true && r.continuacoes === 4, `truncated=${r.truncated}`);
}

// ====== 7) QUEM RESPONDEU É ANUNCIADO ANTES DO PRIMEIRO PEDAÇO ======
{
  servidorDeMentira([
    evento({ modeloUsado: 'gemini-3.5-flash', modeloPreferido: 'gemini-3.6-flash' }),
    evento({ text: 'código' }),
    evento({ done: true, text: 'código', finishReason: 'STOP', modeloUsado: 'gemini-3.5-flash', modeloPreferido: 'gemini-3.6-flash' }),
    'data: [DONE]\n\n'
  ]);
  let anunciado = null;
  const r = await gerarCodigoEmFluxo({}, { aoSaberModelo: (usado, preferido) => { anunciado = [usado, preferido]; } });
  registrar('o modelo de reserva que respondeu é anunciado, e não trocado em silêncio',
    anunciado?.[0] === 'gemini-3.5-flash' && anunciado?.[1] === 'gemini-3.6-flash' && r.modeloUsado === 'gemini-3.5-flash',
    anunciado ? anunciado.join(' no lugar de ') : 'não anunciou');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
