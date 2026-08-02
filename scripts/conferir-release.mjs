/**
 * Confere se a Release da versão atual está realmente entregando os arquivos ao usuário.
 *
 *   node scripts/conferir-release.mjs v1.2.3 latest.yml .exe
 *
 * Roda no final do workflow de publicação, depois do electron-builder. Existe porque "o build
 * passou" e "o usuário consegue baixar" são duas coisas diferentes, e a v1.2.3 provou isso: os
 * dois jobs terminaram verdes, os arquivos foram enviados com sucesso, e mesmo assim todo link
 * de download respondia 404.
 *
 * O motivo é uma corrida dentro do próprio electron-builder. Ele envia os arquivos em paralelo,
 * e cada envio começa perguntando "a Release desta tag existe? se não, cria". Dois envios
 * simultâneos recebem "não" ao mesmo tempo e os DOIS criam — o GitHub aceita duas Releases com a
 * mesma tag sem reclamar uma única vez. Os arquivos se dividem entre os dois registros e a página
 * da tag mostra só um. Se calhar de mostrar o registro que ficou sem o instalador, o download
 * quebra para todo mundo e a atualização automática para junto, porque o latest.yml some com ele.
 *
 * Por isso a pergunta feita aqui não é "o envio deu certo?", e sim "o que a tag está servindo
 * agora?" — que é exatamente o que o usuário e o atualizador automático vão encontrar.
 */

const [, , tag, manifesto, extensaoInstalador] = process.argv;

if (!tag || !manifesto || !extensaoInstalador) {
  console.error("uso: node scripts/conferir-release.mjs <tag> <manifesto.yml> <.extensao>");
  process.exit(2);
}

const repo = process.env.GITHUB_REPOSITORY || "zerobob623-bit/OSONE-AI";
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";

const cabecalhos = {
  Accept: "application/vnd.github+json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function api(caminho) {
  const res = await fetch(`https://api.github.com/repos/${repo}${caminho}`, { headers: cabecalhos });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${caminho}`);
  return res.json();
}

/**
 * O registro que a tag serve. É o mesmo que o GitHub usa para resolver os links de download
 * (/releases/download/<tag>/<arquivo>), então olhar aqui responde pela página inteira.
 */
const servida = await api(`/releases/tags/${tag}`);
const nomes = (servida.assets || []).map((a) => a.name);

const temManifesto = nomes.includes(manifesto);
const temInstalador = nomes.some((n) => n.endsWith(extensaoInstalador));

if (temManifesto && temInstalador) {
  console.log(`OK: a tag ${tag} está servindo o instalador e o manifesto de atualização.`);
  console.log(`    arquivos: ${nomes.join(", ")}`);
  process.exit(0);
}

// Daqui para baixo é só diagnóstico: se falhou, a mensagem precisa dizer o que fazer, senão o
// erro vira mais um log vermelho sem saída.
console.error(`ERRO: a tag ${tag} não está servindo o que deveria.`);
console.error(`  esperado: ${manifesto} e um arquivo ${extensaoInstalador}`);
console.error(`  presente: ${nomes.length ? nomes.join(", ") : "(nenhum arquivo)"}`);

const iguais = (await api("/releases?per_page=100")).filter((r) => r.tag_name === tag);

if (iguais.length > 1) {
  console.error("");
  console.error(`CAUSA: existem ${iguais.length} Releases com a MESMA tag ${tag}.`);
  console.error("Os arquivos se dividiram entre elas e a página está mostrando a incompleta.");
  console.error("");
  for (const r of iguais) {
    const detalhe = await api(`/releases/${r.id}`);
    const lista = (detalhe.assets || []).map((a) => a.name).join(", ") || "(vazia)";
    const marca = r.id === servida.id ? "  <-- é esta que a tag mostra" : "";
    console.error(`  registro ${r.id}: ${lista}${marca}`);
  }
  console.error("");
  console.error("COMO RESOLVER: abra a aba Releases, apague o registro que NÃO tem o instalador");
  console.error("e confira se a página da tag passou a mostrar o registro completo.");
}

process.exit(1);
