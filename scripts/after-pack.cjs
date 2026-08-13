const fs = require('fs');
const path = require('path');

/**
 * O pacote onnxruntime-node distribui binários de todos os sistemas no mesmo npm. Como o OSONE
 * gera Windows e Linux em jobs separados, carregar macOS, ARM, CUDA e o sistema oposto dentro
 * de cada instalador só adicionaria centenas de megabytes sem nenhuma função.
 */
module.exports = async function reduzirRuntimeDeVoz(context) {
  const plataforma = context.electronPlatformName;
  const arquitetura = context.arch === 0 ? 'ia32'
    : context.arch === 2 ? 'armv7l'
      : context.arch === 3 ? 'arm64'
        : 'x64';
  const raiz = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'onnxruntime-node',
    'bin',
    'napi-v6'
  );
  if (!fs.existsSync(raiz)) return;

  const desejado = path.join(plataforma, arquitetura);
  for (const sistema of fs.readdirSync(raiz)) {
    const pastaSistema = path.join(raiz, sistema);
    if (!fs.statSync(pastaSistema).isDirectory()) continue;
    if (sistema !== plataforma) {
      fs.rmSync(pastaSistema, { recursive: true, force: true });
      continue;
    }
    for (const arch of fs.readdirSync(pastaSistema)) {
      const relativo = path.join(sistema, arch);
      if (relativo !== desejado) fs.rmSync(path.join(pastaSistema, arch), { recursive: true, force: true });
    }
  }

  // O OSONE usa CPU. Os providers CUDA/TensorRT pesam centenas de MB, exigem bibliotecas da
  // NVIDIA e nunca são selecionados pelo runtime; mantê-los seria só aumentar o download.
  const pastaAlvo = path.join(raiz, desejado);
  for (const nome of [
    'libonnxruntime_providers_cuda.so',
    'libonnxruntime_providers_tensorrt.so',
    'DirectML.dll',
    'dxcompiler.dll',
    'dxil.dll',
  ]) {
    fs.rmSync(path.join(pastaAlvo, nome), { force: true });
  }
  console.log(`[VOZ NATURAL] Runtime do instalador reduzido para ${desejado} (CPU).`);
};
