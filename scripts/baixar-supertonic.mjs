import { garantirAssetsSupertonic, informacoesSupertonic } from '../src/lib/supertonic-assets.mjs';

try {
  const pasta = await garantirAssetsSupertonic();
  console.log(`Voz natural pronta em: ${pasta}`);
  console.log(`Modelo: ${informacoesSupertonic.modelo}; vozes instaladas: feminina F1 e masculina M1.`);
} catch (erro) {
  console.error(`Não foi possível preparar a voz natural: ${erro?.message || erro}`);
  process.exitCode = 1;
}
