/**
 * Mantem a versao Android derivada do package.json.
 *
 * O versionName e o mesmo do desktop. O versionCode precisa ser inteiro e sempre crescente;
 * 1.3.8 vira 10308, deixando espaco para 99 patches e 99 minors sem perder ordenacao.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const manifestUrl = new URL('../android/twa-manifest.json', import.meta.url);
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
const partes = String(packageJson.version).split('.').map(Number);

if (partes.length !== 3 || partes.some(numero => !Number.isInteger(numero) || numero < 0)) {
  throw new Error(`Versao invalida para Android: ${packageJson.version}`);
}

const [major, minor, patch] = partes;
if (minor > 99 || patch > 99) {
  throw new Error('O versionCode Android reserva dois digitos para minor e patch.');
}

manifest.appVersion = packageJson.version;
manifest.appVersionCode = major * 10000 + minor * 100 + patch;
writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Android sincronizado: ${manifest.appVersion} (${manifest.appVersionCode}).`);
