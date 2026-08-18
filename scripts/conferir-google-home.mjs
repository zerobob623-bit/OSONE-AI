/**
 * Confere o que o Google Assistente RECEBE e o que ele consegue MANDAR pela ponte do OSONE.
 *
 * Por que existe: a ponte funcionava e mentia por baixo. Ela tinha uma tradução própria de
 * aparelho, separada da que o painel e o chat usam, e essa segunda lógica só sabia ligar e
 * desligar. Os defeitos que saíam disso não davam erro em lugar nenhum:
 *
 * - BRILHO E COR SUMIAM NO CAMINHO: toda lâmpada chegava ao Google como interruptor simples.
 *   A mesma lâmpada que o painel regulava respondia "não sei fazer isso" a "põe a sala em 30%",
 *   e não havia nada para investigar — o SYNC nunca tinha anunciado o recurso.
 * - FECHADURA VIRAVA INTERRUPTOR: o mapeamento caía no padrão SWITCH para toda categoria
 *   desconhecida, inclusive as de trava. A regra que o OSONE aplica em todo o resto do sistema
 *   — voz não abre fechadura, e no texto só com confirmação humana — não era nem consultada
 *   aqui. Quem estivesse perto de qualquer aparelho com Assistente mandava destrancar falando.
 * - DESVINCULAR NÃO DESVINCULAVA: a intent DISCONNECT respondia um objeto vazio e os tokens
 *   continuavam válidos. Remover o OSONE no app do celular não cortava acesso nenhum, e o
 *   usuário tinha todo motivo para acreditar que tinha cortado.
 *
 * A conferência roda o serviço de verdade, com a Tuya trocada por uma casa de mentira que se
 * comporta como cada modelo real se comporta. O que se observa é o que chega em
 * sendDeviceCommand — ou seja, o que o aparelho receberia de fato.
 *
 * Como rodar:
 *   node scripts/conferir-google-home.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-ghome-'));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

/**
 * A Tuya trocada por uma casa de mentira. É um plugin do esbuild em vez de um parâmetro do
 * serviço: assim o código conferido é exatamente o que roda em produção, sem nenhum desvio de
 * teste embutido nele.
 */
const casaDeMentira = {
  name: 'casa-de-mentira',
  setup(build) {
    build.onResolve({ filter: /tuyaService$/ }, () => ({ path: 'tuya', namespace: 'mentira' }));
    build.onLoad({ filter: /.*/, namespace: 'mentira' }, () => ({
      loader: 'js',
      contents: `
        export async function getTuyaDevices() {
          const casa = globalThis.__casa;
          if (casa.erroNaLista) throw new Error(casa.erroNaLista);
          return casa.aparelhos;
        }
        export async function getDeviceStatus(id) {
          const casa = globalThis.__casa;
          casa.consultados.push(id);
          const dev = casa.aparelhos.find(d => d.id === id);
          if (!dev) throw new Error('aparelho inexistente');
          if (dev.falhaNoStatus) throw new Error(dev.falhaNoStatus);
          return dev.pontos || [];
        }
        export async function sendDeviceCommand(id, commands) {
          globalThis.__casa.enviados.push({ id, commands });
          return true;
        }
        export function explicarErroTuya(m) { return 'Explicado: ' + m; }
      `
    }));
  }
};

const bundle = path.join(pastaTemp, 'ponte.mjs');
await build({
  entryPoints: [path.join(RAIZ, 'src/googleHomeService.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  outfile: bundle,
  plugins: [casaDeMentira],
  absWorkingDir: RAIZ,
  logLevel: 'silent'
});

// O serviço grava os tokens em process.cwd(). Rodando na pasta temporária, o conferidor não
// encosta em nenhum vínculo real de quem estiver com o OSONE configurado nesta máquina.
process.chdir(pastaTemp);
process.env.GOOGLE_HOME_CLIENT_ID = 'id-de-teste';
process.env.GOOGLE_HOME_CLIENT_SECRET = 'segredo-de-teste';

const ponte = await import('file://' + bundle);

// Os pontos de dados de cada modelo, como a Tuya os reporta.
const LAMPADA_ATUAL = [
  { code: 'switch_led', value: false },
  { code: 'work_mode', value: 'white' },
  { code: 'bright_value_v2', value: 505 },
  { code: 'colour_data_v2', value: '{"h":240,"s":1000,"v":1000}' }
];
const LAMPADA_ANTIGA = [
  { code: 'switch_led', value: true },
  { code: 'bright_value', value: 140 },
  { code: 'colour_data', value: '{"h":0,"s":255,"v":255}' }
];
const TOMADA = [{ code: 'switch_1', value: false }];
const SENSOR = [{ code: 'temp_current', value: 23 }];

const montarCasa = (aparelhos) => {
  globalThis.__casa = { aparelhos, enviados: [], consultados: [] };
  return globalThis.__casa;
};

const CASA_PADRAO = () => montarCasa([
  { id: 'lampada-sala', name: 'Lampada da Sala', category: 'dj', online: true, status: LAMPADA_ATUAL, pontos: LAMPADA_ATUAL },
  { id: 'lampada-velha', name: 'Lampada Velha', category: 'dj', online: true, status: LAMPADA_ANTIGA, pontos: LAMPADA_ANTIGA },
  { id: 'tomada', name: 'Tomada da Varanda', category: 'cz', online: true, status: TOMADA, pontos: TOMADA },
  { id: 'fechadura', name: 'Fechadura da Frente', category: 'ms', online: true, status: [{ code: 'switch_1', value: true }], pontos: [{ code: 'switch_1', value: true }] },
  { id: 'sensor', name: 'Sensor do Quarto', category: 'wsdcg', online: true, status: SENSOR, pontos: SENSOR }
]);

const executar = (id, command, params) =>
  ponte.handleExecute([{ devices: [{ id }], execution: [{ command, params }] }]);

// 1) A lâmpada precisa chegar ao Google COM brilho e cor, e não como interruptor.
{
  CASA_PADRAO();
  const sync = await ponte.handleSync();
  const lampada = sync.devices.find(d => d.id === 'lampada-sala');
  const traits = lampada?.traits || [];
  const temTudo = traits.includes('action.devices.traits.OnOff')
    && traits.includes('action.devices.traits.Brightness')
    && traits.includes('action.devices.traits.ColorSetting');
  registrar('a lâmpada chega ao Google com brilho e cor, não só liga/desliga',
    temTudo && lampada?.attributes?.colorModel === 'hsv',
    temTudo ? `traits: ${traits.map(t => t.split('.').pop()).join(', ')}` : `só recebeu: ${JSON.stringify(traits)}`);
}

// 2) A tomada não pode ganhar brilho que ela não tem.
{
  CASA_PADRAO();
  const sync = await ponte.handleSync();
  const tomada = sync.devices.find(d => d.id === 'tomada');
  registrar('a tomada vai como OUTLET e sem recurso que ela não tem',
    tomada?.type === 'action.devices.types.OUTLET' && tomada.traits.length === 1,
    `${tomada?.type} com ${tomada?.traits.length} recurso(s)`);
}

// 3) FECHADURA NÃO VAI PARA O ASSISTENTE. É a regra do resto do OSONE, aplicada aqui também.
{
  CASA_PADRAO();
  const sync = await ponte.handleSync();
  const mapa = await ponte.mapearAparelhosParaGoogle();
  const foi = sync.devices.some(d => d.id === 'fechadura');
  const motivo = mapa.ignorados.find(i => i.id === 'fechadura')?.motivo || '';
  registrar('fechadura fica FORA do Google, com o motivo registrado',
    !foi && /fechadura/i.test(motivo),
    foi ? 'A FECHADURA FOI ENTREGUE AO ASSISTENTE' : `ignorada: ${motivo.slice(0, 60)}…`);
}

// 4) Mesmo que o Google guarde o id da fechadura de um SYNC antigo, o comando não pode passar.
{
  const casa = CASA_PADRAO();
  const r = await executar('fechadura', 'action.devices.commands.OnOff', { on: false });
  registrar('comando na fechadura é recusado sem tocar na Tuya',
    r.commands[0]?.status === 'ERROR' && casa.enviados.length === 0,
    casa.enviados.length === 0 ? `recusou com ${r.commands[0]?.errorCode}` : 'MANDOU COMANDO PARA A FECHADURA');
}

// 5) Sensor não tem o que comandar: não é anunciado, em vez de virar interruptor.
{
  CASA_PADRAO();
  const sync = await ponte.handleSync();
  const mapa = await ponte.mapearAparelhosParaGoogle();
  registrar('aparelho sem liga/desliga não é anunciado ao Google',
    !sync.devices.some(d => d.id === 'sensor') && mapa.ignorados.some(i => i.id === 'sensor'),
    mapa.ignorados.find(i => i.id === 'sensor')?.motivo?.slice(0, 60) || 'FOI ANUNCIADO');
}

// 6) QUERY: o estado tem de sair na escala do Google, e não na da Tuya.
{
  CASA_PADRAO();
  const q = await ponte.handleQuery(['lampada-sala']);
  const e = q.devices['lampada-sala'];
  const cor = e?.color?.spectrumHsv;
  registrar('QUERY devolve brilho em % e cor em spectrumHsv (s/v de 0 a 1)',
    e?.status === 'SUCCESS' && e.brightness === 50 && cor?.hue === 240 && cor.saturation === 1 && cor.value === 1,
    `brilho ${e?.brightness}%, cor ${JSON.stringify(cor)}`);
}

// 7) A lâmpada ANTIGA guarda cor numa escala que vai só até 255. Dividir por 1000 devolveria
//    ao Google um cinza para uma lâmpada que está vermelha na parede.
{
  CASA_PADRAO();
  const q = await ponte.handleQuery(['lampada-velha']);
  const cor = q.devices['lampada-velha']?.color?.spectrumHsv;
  registrar('cor da lâmpada antiga é lida na escala dela (0–255), não na de 0–1000',
    cor?.saturation === 1 && cor?.value === 1,
    `saturação ${cor?.saturation}, valor ${cor?.value}`);
}

// 8) EXECUTE de brilho: código e escala do aparelho, e não um valor chutado.
{
  const casa = CASA_PADRAO();
  const r = await executar('lampada-sala', 'action.devices.commands.BrightnessAbsolute', { brightness: 40 });
  const cmd = casa.enviados[0]?.commands || [];
  const brilho = cmd.find(c => /bright_value/.test(c.code));
  registrar('"põe em 40%" manda bright_value_v2 na escala 10–1000',
    r.commands[0]?.status === 'SUCCESS' && brilho?.code === 'bright_value_v2' && brilho.value === 406,
    brilho ? `${brilho.code} = ${brilho.value}` : `nenhum comando de brilho: ${JSON.stringify(cmd)}`);
}

// 9) Brilho na lâmpada antiga: a escala é OUTRA (25–255).
{
  const casa = CASA_PADRAO();
  await executar('lampada-velha', 'action.devices.commands.BrightnessAbsolute', { brightness: 40 });
  const brilho = (casa.enviados[0]?.commands || []).find(c => /bright_value/.test(c.code));
  registrar('na lâmpada antiga o mesmo 40% vira bright_value na escala 25–255',
    brilho?.code === 'bright_value' && brilho.value === 117,
    brilho ? `${brilho.code} = ${brilho.value}` : 'nenhum comando de brilho');
}

// 10) EXECUTE de cor: sem entrar no modo colorido, a lâmpada aceita a cor e continua branca.
{
  const casa = CASA_PADRAO();
  const r = await executar('lampada-sala', 'action.devices.commands.ColorAbsolute', {
    color: { spectrumHSV: { hue: 120, saturation: 1, value: 1 } }
  });
  const cmd = casa.enviados[0]?.commands || [];
  const cor = cmd.find(c => /colour_data/.test(c.code));
  const matiz = cor ? JSON.parse(cor.value).h : null;
  registrar('a cor pedida por voz chega com o modo colorido e o ligar juntos',
    r.commands[0]?.status === 'SUCCESS'
      && matiz === 120
      && cmd.some(c => c.code === 'work_mode' && c.value === 'colour')
      && cmd.some(c => c.code === 'switch_led' && c.value === true),
    JSON.stringify(cmd));
}

// 11) A cor mandada à lâmpada antiga precisa respeitar o teto de 255 dela.
{
  const casa = CASA_PADRAO();
  await executar('lampada-velha', 'action.devices.commands.ColorAbsolute', {
    color: { spectrumHSV: { hue: 0, saturation: 1, value: 1 } }
  });
  const cor = (casa.enviados[0]?.commands || []).find(c => /colour_data/.test(c.code));
  const hsv = cor ? JSON.parse(cor.value) : null;
  registrar('a cor da lâmpada antiga sai no teto 255, e não num valor fora da faixa',
    cor?.code === 'colour_data' && hsv?.s === 255 && hsv?.v === 255,
    hsv ? `${cor.code} = ${JSON.stringify(hsv)}` : 'nenhum comando de cor');
}

// 12) Liga/desliga usa o código REAL da lâmpada (switch_led), e não 'switch_1' fixo.
{
  const casa = CASA_PADRAO();
  await executar('lampada-sala', 'action.devices.commands.OnOff', { on: true });
  const cmd = casa.enviados[0]?.commands || [];
  registrar('ligar a lâmpada usa switch_led, e não um switch_1 chutado',
    cmd.length === 1 && cmd[0].code === 'switch_led' && cmd[0].value === true,
    JSON.stringify(cmd));
}

// 13) Cor numa tomada: recusa explicada, e nada é enviado.
{
  const casa = CASA_PADRAO();
  const r = await executar('tomada', 'action.devices.commands.ColorAbsolute', {
    color: { spectrumHSV: { hue: 200, saturation: 1, value: 1 } }
  });
  registrar('pedir cor a uma tomada recusa em vez de anunciar sucesso',
    r.commands[0]?.status === 'ERROR' && r.commands[0]?.errorCode === 'functionNotSupported' && casa.enviados.length === 0,
    casa.enviados.length === 0 ? `recusou com ${r.commands[0]?.errorCode}` : 'MANDOU COMANDO MESMO ASSIM');
}

// 14) Aparelho que a Tuya não consegue ler não vira "online e desligado".
{
  montarCasa([{ id: 'muda', name: 'Lampada Muda', category: 'dj', online: true, status: [], falhaNoStatus: 'timeout' }]);
  const q = await ponte.handleQuery(['muda']);
  registrar('aparelho ilegível é reportado OFFLINE, e não como conectado e desligado',
    q.devices['muda']?.status === 'OFFLINE' && q.devices['muda']?.online === false,
    JSON.stringify(q.devices['muda']));
}

// 15) Tuya fora do ar no EXECUTE: erro coerente, sem comando fantasma.
{
  const casa = CASA_PADRAO();
  casa.erroNaLista = 'Timeout na comunicação com a Tuya Cloud API';
  const r = await executar('lampada-sala', 'action.devices.commands.OnOff', { on: true });
  registrar('com a Tuya fora do ar o comando falha em vez de fingir que foi',
    r.commands[0]?.status === 'ERROR' && casa.enviados.length === 0,
    `${r.commands[0]?.errorCode}, ${casa.enviados.length} comando(s) enviado(s)`);
}

// 15.5) SEM CÓDIGO DE PAREAMENTO, /approve NÃO PODE EMITIR NADA — era exatamente essa falta
//       de prova de dono que deixava qualquer requisição HTTP aprovar o vínculo sozinha.
{
  let recusou = false;
  try {
    ponte.issueAuthCode('');
  } catch {
    recusou = true;
  }
  registrar('issueAuthCode sem código de pareamento é recusado',
    recusou, recusou ? 'recusou como esperado' : 'EMITIU CÓDIGO DE AUTORIZAÇÃO SEM PROVA DE DONO');

  let recusouCodigoErrado = false;
  try {
    ponte.issueAuthCode('ZZZZ-ZZZZ');
  } catch {
    recusouCodigoErrado = true;
  }
  registrar('issueAuthCode com código de pareamento inventado é recusado',
    recusouCodigoErrado, recusouCodigoErrado ? 'recusou como esperado' : 'EMITIU CÓDIGO DE AUTORIZAÇÃO COM PAREAMENTO FALSO');
}

// 16) DESVINCULAR PRECISA DESVINCULAR.
{
  const pareamento = ponte.issueLocalPairingCode();
  const codigo = ponte.issueAuthCode(pareamento.code);
  const tokens = ponte.exchangeToken({
    grantType: 'authorization_code',
    code: codigo,
    clientId: 'id-de-teste',
    clientSecret: 'segredo-de-teste'
  });
  const valiaAntes = ponte.isValidAccessToken(tokens.access_token);
  const vinculadoAntes = ponte.lerEstadoDoVinculo().vinculado;

  ponte.handleDisconnect();

  const valeDepois = ponte.isValidAccessToken(tokens.access_token);
  const vinculadoDepois = ponte.lerEstadoDoVinculo().vinculado;

  registrar('desvincular no app do Google invalida os tokens de verdade',
    valiaAntes && vinculadoAntes && !valeDepois && !vinculadoDepois,
    valeDepois ? 'O TOKEN CONTINUOU VALENDO DEPOIS DE DESVINCULAR' : 'token invalidado e vínculo desfeito');
}

// 17) O diagnóstico precisa distinguir "sem credencial" de "sem vínculo" — são consertos
//     diferentes, e a tela antiga dava o mesmo verde para os dois.
{
  CASA_PADRAO();
  const semVinculo = await ponte.diagnosticarGoogleHome();

  const idSalvo = process.env.GOOGLE_HOME_CLIENT_ID;
  delete process.env.GOOGLE_HOME_CLIENT_ID;
  const semCredencial = await ponte.diagnosticarGoogleHome();
  process.env.GOOGLE_HOME_CLIENT_ID = idSalvo;

  registrar('o diagnóstico separa "falta credencial" de "falta vincular a conta"',
    semCredencial.etapa === 'credenciais' && semVinculo.etapa === 'vinculo' && semVinculo.expostos.length === 3,
    `sem credencial: ${semCredencial.etapa}; sem vínculo: ${semVinculo.etapa} com ${semVinculo.expostos?.length} aparelho(s)`);
}

process.chdir(RAIZ);
fs.rmSync(pastaTemp, { recursive: true, force: true });

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
