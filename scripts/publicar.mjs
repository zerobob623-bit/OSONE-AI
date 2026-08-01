/**
 * Publica uma nova versão do OSONE para todos os usuários.
 *
 *   npm run publicar 1.2.0
 *
 * Faz, na ordem certa: confere se está tudo em ordem, atualiza o número no package.json,
 * commita, envia para a main, cria a tag e a envia. É a tag que dispara o GitHub Actions, que
 * por sua vez compila o .exe/AppImage e publica no Releases — de onde os apps já instalados
 * baixam a atualização sozinhos.
 *
 * As verificações antes de qualquer alteração existem porque este comando alcança TODO MUNDO
 * automaticamente: uma versão publicada por engano chega em quem já instalou, sem ninguém
 * clicar em nada. É mais barato recusar aqui do que corrigir depois de distribuído.
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const AZUL = "\x1b[36m", VERDE = "\x1b[32m", VERM = "\x1b[31m", AMAR = "\x1b[33m", FIM = "\x1b[0m";
const ok = (m) => console.log(`${VERDE}  OK${FIM}  ${m}`);
const passo = (m) => console.log(`\n${AZUL}==> ${m}${FIM}`);

function abortar(titulo, comoResolver) {
  console.error(`\n${VERM}PUBLICAÇÃO CANCELADA: ${titulo}${FIM}`);
  if (comoResolver) console.error(`\nComo resolver:\n${comoResolver}\n`);
  process.exit(1);
}

/** Roda um comando e devolve a saída em texto. */
const sh = (cmd) => execSync(cmd, { encoding: "utf-8" }).trim();
/** Roda um comando mostrando a saída na tela (para os passos que alteram algo de verdade). */
const shVisivel = (cmd) => execSync(cmd, { stdio: "inherit" });

const versao = (process.argv[2] || "").trim().replace(/^v/, "");

// ---------------------------------------------------------------- verificações
passo("Conferindo se está tudo pronto para publicar");

if (!versao) {
  abortar(
    "você não disse qual é a nova versão.",
    "  npm run publicar 1.2.0\n\n" +
    "Regra dos números: corrigiu bug -> 1.1.1 | função nova -> 1.2.0 | mudou tudo -> 2.0.0"
  );
}

if (!/^\d+\.\d+\.\d+$/.test(versao)) {
  abortar(
    `'${versao}' não é um número de versão válido.`,
    "Use três números separados por ponto, sem letras. Ex: 1.2.0"
  );
}

const versaoAtual = JSON.parse(readFileSync("package.json", "utf-8")).version;
const maior = (a, b) => {
  const [a1, a2, a3] = a.split(".").map(Number);
  const [b1, b2, b3] = b.split(".").map(Number);
  return a1 !== b1 ? a1 > b1 : a2 !== b2 ? a2 > b2 : a3 > b3;
};
// O app instalado compara números para decidir se atualiza: repetir ou diminuir a versão faz
// a atualização automática simplesmente não acontecer, sem erro nenhum aparecer.
if (!maior(versao, versaoAtual)) {
  abortar(
    `a versão ${versao} não é maior que a atual (${versaoAtual}).`,
    `O número precisa sempre subir, senão ninguém recebe a atualização.\n` +
    `Tente algo como ${versaoAtual.split(".").slice(0, 2).join(".")}.${Number(versaoAtual.split(".")[2]) + 1}`
  );
}
ok(`versão ${versaoAtual} -> ${versao}`);

const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  abortar(
    `você está na branch '${branch}', não na 'main'.`,
    "  git checkout main\n  git pull origin main"
  );
}
ok("você está na branch main");

// git commit -am varre TODO arquivo modificado: trabalho pela metade ou código de teste
// entraria na versão publicada sem você perceber.
const sujo = sh("git status --porcelain");
if (sujo) {
  abortar(
    "existem alterações não commitadas.",
    "Commite ou descarte antes de publicar, para não enviar trabalho pela metade:\n" +
    "  git status\n  git add -A && git commit -m 'descreva o que mudou'\n\n" +
    `Arquivos alterados:\n${sujo.split("\n").map(l => "  " + l).join("\n")}`
  );
}
ok("não há alterações pendentes");

try {
  sh("git fetch origin main --quiet");
  const atras = sh("git rev-list --count HEAD..origin/main");
  if (Number(atras) > 0) {
    abortar(
      `sua main está ${atras} commit(s) atrás do GitHub.`,
      "  git pull origin main"
    );
  }
  ok("sua main está atualizada com o GitHub");
} catch {
  console.log(`${AMAR}  aviso${FIM}  não consegui consultar o GitHub (sem internet?). Seguindo mesmo assim.`);
}

const tag = `v${versao}`;
const tagsExistentes = sh("git tag -l").split("\n");
if (tagsExistentes.includes(tag)) {
  abortar(
    `a tag ${tag} já existe.`,
    `Essa versão já foi publicada. Escolha um número maior.`
  );
}
ok(`a tag ${tag} está livre`);

// Sem as dependências instaladas, o tsc acusa centenas de erros que não têm nada a ver com o
// seu código ("Cannot find module 'vite'", "Cannot find name 'process'"...). Sem esta checagem
// a mensagem seguinte diria "seu código tem erros", mandando você caçar um problema
// inexistente.
if (!existsSync("node_modules")) {
  abortar(
    "as dependências não estão instaladas.",
    "  npm install\n\nDepois rode a publicação de novo."
  );
}

// Falha de tipagem derrubaria a compilação lá no GitHub, DEPOIS de a tag já existir — e aí
// sobra uma tag órfã para apagar na mão. Conferir aqui custa alguns segundos e evita isso.
passo("Conferindo se o código compila (evita tag órfã)");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
  ok("nenhum erro de tipagem");
} catch {
  abortar(
    "o código tem erros que impediriam a compilação.",
    "Corrija os erros acima e tente de novo. Nada foi publicado."
  );
}

// ---------------------------------------------------------------- publicação
passo(`Publicando a versão ${versao}`);

shVisivel(`npm version ${versao} --no-git-tag-version`);
ok("número atualizado no package.json");

shVisivel(`git commit -am "versão ${versao}"`);
ok("commit criado");

shVisivel("git push origin main");
ok("enviado para a main");

shVisivel(`git tag ${tag}`);
shVisivel(`git push origin ${tag}`);
ok(`tag ${tag} enviada — o GitHub começou a compilar`);

console.log(`
${VERDE}Pronto! A versão ${versao} foi enviada.${FIM}

O GitHub está compilando o .exe e o AppImage agora. Leva uns 10 a 15 minutos.

  Acompanhar:  https://github.com/zerobob623-bit/OSONE-AI/actions
  Resultado:   https://github.com/zerobob623-bit/OSONE-AI/releases

Quando terminar, quem já tem o OSONE instalado recebe a atualização sozinho:
o app baixa em segundo plano ao ser aberto e instala quando for fechado.
`);
