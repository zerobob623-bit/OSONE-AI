import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const MODELO = 'Supertone/supertonic-3';
// Revisão imutável: o repositório do modelo pode atualizar "main", mas uma instalação do
// OSONE deve baixar exatamente os pesos que foram conferidos junto com estes tamanhos.
const REVISAO = '3cadd1ee6394adea1bd021217a0e650ede09a323';
const BASE = `https://huggingface.co/${MODELO}/resolve/${REVISAO}`;

// Tamanhos publicados pelo repositório oficial. Além de detectar download interrompido, esta
// conferência impede que uma página de erro HTML seja aceita como se fosse um modelo ONNX.
const ARQUIVOS = [
  ['LICENSE', 15_007, '0d944a9110fed9a9602d60e0423a272903e7bd21ab060490774efc77c2275e9f'],
  ['onnx/duration_predictor.onnx', 3_700_147, 'c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db'],
  ['onnx/text_encoder.onnx', 36_416_150, 'c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff'],
  ['onnx/vector_estimator.onnx', 256_534_781, '883ac868ea0275ef0e991524dc64f16b3c0376efd7c320af6b53f5b780d7c61c'],
  ['onnx/vocoder.onnx', 101_424_195, '085de76dd8e8d5836d6ca66826601f615939218f90e519f70ee8a36ed2a4c4ba'],
  ['onnx/tts.json', 8_253, '42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09'],
  ['onnx/unicode_indexer.json', 277_676, '9bf7346e43883a81f8645c81224f786d43c5b57f3641f6e7671a7d6c493cb24f'],
  ['voice_styles/F1.json', 292_046, 'bbdec6ee00231c2c742ad05483df5334cab3b52fda3ba38e6a07059c4563dbc2'],
  ['voice_styles/M1.json', 291_748, 'e35604687f5d23694b8e91593a93eec0e4eca6c0b02bb8ed69139ab2ea6b0a5b'],
];

let downloadEmAndamento = null;

export function pastaDosAssetsSupertonic() {
  return path.join(process.cwd(), '.osone-models', 'supertonic-3');
}

export function assetsSupertonicCompletos(dir = pastaDosAssetsSupertonic()) {
  try {
    if (fs.readFileSync(path.join(dir, '.verified-revision'), 'utf8').trim() !== REVISAO) return false;
  } catch { return false; }
  return ARQUIVOS.every(([relativo, tamanho]) => {
    const arquivo = path.join(dir, relativo);
    try { return fs.statSync(arquivo).size === tamanho; } catch { return false; }
  });
}

function sha256DoArquivo(arquivo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(arquivo);
    stream.on('error', reject);
    stream.on('data', bloco => hash.update(bloco));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function baixarArquivo(relativo, tamanho, sha256, destinoRaiz) {
  const destino = path.join(destinoRaiz, relativo);
  const temporario = `${destino}.part`;
  fs.mkdirSync(path.dirname(destino), { recursive: true });

  try {
    if (fs.statSync(destino).size === tamanho && await sha256DoArquivo(destino) === sha256) return;
  } catch { /* ainda não existe ou está corrompido */ }

  fs.rmSync(temporario, { force: true });
  console.log(`[VOZ NATURAL] Baixando ${relativo} (${(tamanho / 1024 / 1024).toFixed(1)} MB)...`);
  const resposta = await fetch(`${BASE}/${relativo}?download=true`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(300_000),
  });
  if (!resposta.ok || !resposta.body) {
    throw new Error(`download de ${relativo} retornou HTTP ${resposta.status}`);
  }

  await pipeline(Readable.fromWeb(resposta.body), fs.createWriteStream(temporario));
  const recebido = fs.statSync(temporario).size;
  if (recebido !== tamanho) {
    fs.rmSync(temporario, { force: true });
    throw new Error(`${relativo} chegou incompleto (${recebido} de ${tamanho} bytes)`);
  }
  const hashRecebido = await sha256DoArquivo(temporario);
  if (hashRecebido !== sha256) {
    fs.rmSync(temporario, { force: true });
    throw new Error(`${relativo} não corresponde ao SHA-256 oficial esperado`);
  }
  fs.renameSync(temporario, destino);
}

export async function garantirAssetsSupertonic() {
  const destinoRaiz = pastaDosAssetsSupertonic();
  if (assetsSupertonicCompletos(destinoRaiz)) return destinoRaiz;
  if (downloadEmAndamento) return downloadEmAndamento;

  downloadEmAndamento = (async () => {
    console.log('[VOZ NATURAL] Primeiro uso: preparando cerca de 400 MB. Isso acontece uma única vez.');
    for (const [relativo, tamanho, sha256] of ARQUIVOS) {
      await baixarArquivo(relativo, tamanho, sha256, destinoRaiz);
    }
    fs.writeFileSync(path.join(destinoRaiz, '.verified-revision'), `${REVISAO}\n`, 'utf8');
    if (!assetsSupertonicCompletos(destinoRaiz)) throw new Error('os arquivos baixados não passaram na conferência final');
    console.log('[VOZ NATURAL] Supertonic 3 pronto para uso local e ilimitado.');
    return destinoRaiz;
  })().finally(() => { downloadEmAndamento = null; });

  return downloadEmAndamento;
}

export const informacoesSupertonic = {
  modelo: MODELO,
  revisao: REVISAO,
  tamanhoTotal: ARQUIVOS.reduce((total, [, tamanho]) => total + tamanho, 0),
  vozes: ['F1', 'M1'],
};
