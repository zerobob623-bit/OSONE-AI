/**
 * Baixa o Piper (voz local e ilimitada) e a voz em português para dentro de vendor/piper.
 *
 *   npm run baixar-voz
 *
 * O Piper roda inteiramente na máquina do usuário: sem cota, sem chave, sem internet depois de
 * instalado. É a última camada do revezamento de voz — quando a cota do Gemini e da ElevenLabs
 * acaba, o áudio continua saindo por aqui em vez de o robô emudecer.
 *
 * O binário e o modelo somam ~90 MB e NÃO ficam no repositório (ver .gitignore): são baixados
 * aqui, tanto na máquina de quem desenvolve quanto no GitHub Actions antes de gerar o
 * instalador, de onde seguem embutidos para o usuário final.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const DESTINO = path.join(RAIZ, "vendor", "piper");

const VERSAO_PIPER = "2023.11.14-2";
const BASE_PIPER = `https://github.com/rhasspy/piper/releases/download/${VERSAO_PIPER}`;

// Voz masculina brasileira de qualidade média: equilíbrio entre naturalidade e tamanho (~60 MB).
const BASE_VOZ = "https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium";
const NOME_VOZ = "pt_BR-faber-medium";

/** Nome do pacote do Piper para a plataforma atual. */
function pacoteDaPlataforma() {
  const so = process.platform;
  const arch = process.arch;
  if (so === "win32") return "piper_windows_amd64.zip";
  if (so === "darwin") return arch === "arm64" ? "piper_macos_aarch64.tar.gz" : "piper_macos_x64.tar.gz";
  if (so === "linux") return arch === "arm64" ? "piper_linux_aarch64.tar.gz" : "piper_linux_x86_64.tar.gz";
  throw new Error(`Plataforma sem build oficial do Piper: ${so}/${arch}`);
}

async function baixar(url, destino, rotulo) {
  process.stdout.write(`  ${rotulo}... `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destino));
  const mb = (await import("node:fs")).statSync(destino).size / 1024 / 1024;
  console.log(`ok (${mb.toFixed(0)} MB)`);
}

/** Extrai .tar.gz (tar) ou .zip (PowerShell no Windows, onde não há tar confiável para zip). */
function extrair(arquivo, destino) {
  if (arquivo.endsWith(".zip")) {
    execFileSync("powershell", ["-NoProfile", "-Command",
      `Expand-Archive -LiteralPath '${arquivo}' -DestinationPath '${destino}' -Force`], { stdio: "inherit" });
  } else {
    execFileSync("tar", ["xzf", arquivo, "-C", destino], { stdio: "inherit" });
  }
}

async function main() {
  const binario = path.join(DESTINO, process.platform === "win32" ? "piper.exe" : "piper");
  const modelo = path.join(DESTINO, `${NOME_VOZ}.onnx`);

  if (existsSync(binario) && existsSync(modelo)) {
    console.log("Piper e voz já estão em vendor/piper — nada a fazer.");
    return;
  }

  console.log(`Baixando a voz local (Piper) para ${process.platform}/${process.arch}:`);
  mkdirSync(DESTINO, { recursive: true });

  const pacote = pacoteDaPlataforma();
  const temporario = path.join(DESTINO, pacote);
  await baixar(`${BASE_PIPER}/${pacote}`, temporario, "programa Piper");

  process.stdout.write("  extraindo... ");
  extrair(temporario, DESTINO);
  rmSync(temporario, { force: true });
  console.log("ok");

  // O pacote extrai numa subpasta "piper/": promove o conteúdo para vendor/piper direto, para o
  // servidor não precisar adivinhar o nível em que o binário ficou.
  const subpasta = path.join(DESTINO, "piper");
  if (existsSync(subpasta)) {
    for (const item of (await import("node:fs")).readdirSync(subpasta)) {
      (await import("node:fs")).renameSync(path.join(subpasta, item), path.join(DESTINO, item));
    }
    rmSync(subpasta, { recursive: true, force: true });
  }

  await baixar(`${BASE_VOZ}/${NOME_VOZ}.onnx`, modelo, "voz em português");
  await baixar(`${BASE_VOZ}/${NOME_VOZ}.onnx.json`, `${modelo}.json`, "config da voz");

  if (process.platform !== "win32") chmodSync(binario, 0o755);

  console.log(`\nPronto. A voz local está em vendor/piper e será usada automaticamente
quando a cota do Gemini e da ElevenLabs acabar.`);
}

main().catch((e) => {
  console.error(`\nFalhou: ${e.message}`);
  console.error("A voz local é opcional — o OSONE continua funcionando com Gemini/ElevenLabs.");
  process.exit(1);
});
