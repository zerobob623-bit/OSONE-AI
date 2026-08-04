/**
 * Confere que o OSONE explica o erro CERTO para cada recusa da Tuya.
 *
 * Por que existe: a Tuya responde com códigos numéricos e frases curtas em inglês, e o OSONE as
 * traduz em "o que fazer". Quando essa tradução erra, ela é pior do que não existir — ela manda a
 * pessoa conferir uma coisa que já está certa, e o problema real fica invisível atrás de uma
 * instrução confiante.
 *
 * Foi o que aconteceu com o código 28841002. Ele estava agrupado com "sem permissão", e a resposta
 * mandava ir autorizar o IoT Core na aba 'Service API'. Só que a mensagem real da Tuya diz
 * "IoT Core service subscription has expired": em uso real, com os cinco serviços autorizados na
 * tela, o erro acontecia mesmo assim. Autorização e assinatura são coisas diferentes, e só uma
 * delas se resolve autorizando.
 *
 * Cada caso aqui amarra uma mensagem real da Tuya à instrução que resolve AQUELE problema.
 *
 * Como rodar:
 *   node scripts/conferir-erros-tuya.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-tuya-erros-'));
const saida = path.join(pastaTemp, 'tuya.mjs');

await build({
  entryPoints: [path.join(RAIZ, 'src/tuyaService.ts')],
  bundle: true, format: 'esm', outfile: saida, platform: 'node',
  nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
});

// A tradução do erro é exportada para poder ser conferida sozinha: o que está sob teste é o texto
// que a pessoa lê, não a ida à rede.
const { explicarErroTuya } = await import('file://' + saida);

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// 1) O caso relatado: assinatura vencida NÃO pode ser explicada como falta de autorização.
{
  const texto = explicarErroTuya('IoT Core service subscription has expired. (código 28841002)');
  const mandaAutorizar = /Go to Authorize|adicione 'IoT Core'/i.test(texto);
  const mandaRenovar = /renov/i.test(texto) && /Purchase/i.test(texto);
  registrar('assinatura vencida manda RENOVAR, e não autorizar de novo',
    mandaRenovar && !mandaAutorizar,
    mandaAutorizar ? 'ainda manda autorizar o que já está autorizado' : 'aponta Purchase e renovação');
}

// 2) A explicação precisa dizer que o IoT Core provavelmente JÁ está autorizado, para a pessoa não
//    perder tempo conferindo o que já viu.
{
  const texto = explicarErroTuya('IoT Core service subscription has expired.');
  registrar('a explicação avisa que a autorização não é o problema',
    /não é falta de autorização/i.test(texto),
    'diferencia assinatura de autorização');
}

// 3) E que não adianta gerar chave nova — o reflexo mais comum diante de um erro de credencial.
{
  const texto = explicarErroTuya('subscription has expired');
  registrar('avisa que trocar as credenciais não resolve',
    /não adianta gerar chave nova/i.test(texto),
    'evita a tentativa inútil');
}

// 4) Falta de permissão DE VERDADE continua com a instrução de autorizar.
{
  const texto = explicarErroTuya("no permissions. Please go to the console to authorize (code 1106)");
  registrar('falta de permissão real continua mandando autorizar o IoT Core',
    /Service API/i.test(texto) && /Go to Authorize/i.test(texto),
    'instrução de autorização preservada');
}

// 5) Os outros diagnósticos não podem ter sido afetados pela separação.
{
  const secret = explicarErroTuya('sign invalid (código 1004)');
  const ip = explicarErroTuya("don't have access to this api, ip(189.4.5.6) (código 1114)");
  const rede = explicarErroTuya('fetch failed: ETIMEDOUT');
  registrar('os demais diagnósticos seguem intactos',
    /TUYA_CLIENT_SECRET/.test(secret) && /189\.4\.5\.6/.test(ip) && /internet/i.test(rede),
    'segredo, lista de IP e rede');
}

// 6) Mensagem desconhecida volta crua, em vez de virar um palpite errado.
{
  const bruto = 'algum erro que ninguem previu aqui';
  registrar('erro desconhecido volta como veio, sem inventar solução',
    explicarErroTuya(bruto) === bruto,
    'sem palpite');
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
