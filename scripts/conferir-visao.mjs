/**
 * Confere a mira por visão (src/lib/mirarPorVisao.ts) sem gastar chamada ao modelo.
 *
 * O que dá para verificar aqui é tudo o que fica ENTRE o modelo e o clique: se a caixa que ele
 * devolve vira o centro certo, se uma resposta suja (cercas de código, frase em volta) ainda é
 * lida, e principalmente se as respostas ruins são RECUSADAS em vez de virarem coordenada. Essa
 * última parte é a que importa: uma caixa inválida aceita em silêncio faz o mouse clicar em algum
 * lugar aleatório da tela do usuário.
 *
 * A qualidade da caixa em si — se o modelo aponta o botão certo — só a tela real responde.
 *
 * Como rodar:  node scripts/conferir-visao.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-visao-'));
const arquivoJs = path.join(pastaTemp, 'visao.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/lib/mirarPorVisao.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: arquivoJs,
  logLevel: 'silent'
});

const { mirarPorVisao } = await import(pathToFileURL(arquivoJs).href);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/** Finge o proxy do Gemini devolvendo um texto qualquer como resposta do modelo. */
const comResposta = (texto, { ok = true, corpo = null } = {}) => {
  globalThis.fetch = async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => (corpo !== null ? corpo : { text: texto })
  });
};

const pedir = () => mirarPorVisao('o botão Instalar', 'data:image/png;base64,AAAA', 'image/png', 'chave', 'modelo');

// Caixa no formato nativo do modelo: [ymin, xmin, ymax, xmax] de 0 a 1000.
{
  comResposta('{"encontrado": true, "box_2d": [120, 700, 180, 860], "descricao": "botão azul escrito Instalar"}');
  const r = await pedir();
  const certo = r.encontrado && r.alvo.centro.x === 780 && r.alvo.centro.y === 150;
  registrar('caixa nativa vira o centro certo', certo,
    certo ? `centro ${r.alvo.centro.x},${r.alvo.centro.y} e viu "${r.alvo.descricao}"` : JSON.stringify(r));
}

// O modelo às vezes embrulha o JSON em cercas de código ou escreve uma frase antes.
{
  comResposta('Claro! Aqui está:\n```json\n{"encontrado": true, "box_2d": [0, 0, 100, 200], "descricao": "x"}\n```');
  const r = await pedir();
  registrar('resposta com cerca e frase em volta ainda é lida', r.encontrado && r.alvo.centro.x === 100 && r.alvo.centro.y === 50,
    r.encontrado ? `centro ${r.alvo.centro.x},${r.alvo.centro.y}` : r.motivo);
}

// Coordenadas trocadas de ordem não podem virar caixa negativa.
{
  comResposta('{"encontrado": true, "box_2d": [800, 900, 200, 100], "descricao": "invertida"}');
  const r = await pedir();
  registrar('caixa com cantos invertidos é endireitada', r.encontrado && r.alvo.centro.x === 500 && r.alvo.centro.y === 500,
    r.encontrado ? `centro ${r.alvo.centro.x},${r.alvo.centro.y}` : r.motivo);
}

// Valores fora da faixa 0–1000 clicariam fora da tela.
{
  comResposta('{"encontrado": true, "box_2d": [-50, 900, 1200, 1400], "descricao": "estourada"}');
  const r = await pedir();
  const dentro = r.encontrado && r.alvo.caixa.x0 >= 0 && r.alvo.caixa.x1 <= 1000 && r.alvo.caixa.y0 >= 0 && r.alvo.caixa.y1 <= 1000;
  registrar('caixa fora da faixa é presa em 0–1000', dentro, r.encontrado ? JSON.stringify(r.alvo.caixa) : r.motivo);
}

// --- Daqui para baixo, o que NÃO pode virar coordenada ---

{
  comResposta('{"encontrado": false, "motivo": "não há nada escrito Instalar nesta tela"}');
  const r = await pedir();
  registrar('não encontrado continua não encontrado', !r.encontrado && /Instalar/.test(r.motivo || ''), r.motivo);
}

{
  comResposta('Não consegui identificar esse elemento na imagem.');
  const r = await pedir();
  registrar('resposta em prosa, sem JSON, é recusada', !r.encontrado, (r.motivo || '').slice(0, 60));
}

{
  comResposta('{"encontrado": true, "box_2d": [10, 10, 10, 10], "descricao": "caixa sem tamanho"}');
  const r = await pedir();
  registrar('caixa de área zero é recusada', !r.encontrado, r.motivo);
}

{
  comResposta('{"encontrado": true, "box_2d": ["a", null, {}, 3], "descricao": "lixo"}');
  const r = await pedir();
  registrar('números inválidos são recusados', !r.encontrado, r.motivo);
}

{
  comResposta(null, { ok: false, corpo: { error: 'cota do Gemini esgotada' } });
  const r = await pedir();
  registrar('erro do servidor vira motivo legível', !r.encontrado && /cota/.test(r.motivo || ''), r.motivo);
}

{
  globalThis.fetch = async () => { throw new Error('rede fora do ar'); };
  const r = await pedir();
  registrar('rede fora do ar não derruba a mira', !r.encontrado && /rede fora do ar/.test(r.motivo || ''), r.motivo);
}

fs.rmSync(pastaTemp, { recursive: true, force: true });

const falharam = casos.filter(c => !c.passou).length;
console.log(`\n${casos.length - falharam}/${casos.length} conferências passaram.`);
process.exit(falharam ? 1 : 0);
