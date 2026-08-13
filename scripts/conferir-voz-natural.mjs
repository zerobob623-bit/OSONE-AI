import fs from 'fs';

const server = fs.readFileSync('server.ts', 'utf8');
const cowork = fs.readFileSync('src/components/CoworkSection.tsx', 'utf8');
const zap = fs.readFileSync('src/components/WhatsAppIntegration.tsx', 'utf8');
const assets = fs.readFileSync('src/lib/supertonic-assets.mjs', 'utf8');
const afterPack = fs.readFileSync('scripts/after-pack.cjs', 'utf8');
const features = fs.readFileSync('FEATURES.md', 'utf8');

const exigir = (condicao, mensagem) => {
  if (!condicao) throw new Error(`Voz natural: ${mensagem}`);
};

exigir(server.includes('sintetizarComSupertonic'), 'backend de síntese ausente');
exigir(server.includes('tts.call(frase, "pt"'), 'idioma português não foi fixado no modelo');
exigir(server.includes('voz === "M1" ? "M1" : "F1"'), 'seleção homem/mulher sem validação');
exigir(server.includes('filaSupertonic.then(executar, executar)'), 'sínteses não estão serializadas');
exigir(server.includes('await sintetizarComVozLocal'), 'fallback Piper ausente');
exigir(cowork.includes('Natural local · feminina') && cowork.includes('Natural local · masculina'), 'COWORK não mostra ambas as vozes');
exigir(zap.includes('Feminina natural') && zap.includes('Masculina natural'), 'WhatsApp não mostra ambas as vozes');
exigir(assets.includes('download=true') && assets.includes('.part'), 'download seguro/retomável não configurado');
exigir(assets.includes('3cadd1ee6394adea1bd021217a0e650ede09a323'), 'pesos não estão presos a uma revisão imutável');
exigir(afterPack.includes('libonnxruntime_providers_cuda.so'), 'empacotamento não remove o provider CUDA inútil');
exigir(afterPack.includes("sistema !== plataforma"), 'empacotamento não remove binários de outros sistemas');
exigir(features.includes('Supertonic 3'), 'FEATURES.md não registra o motor');

console.log('Voz natural: 12/12 conferências estruturais passaram.');
