/**
 * Confere que dá para PREENCHER as credenciais da casa inteligente pela tela.
 *
 * Por que existe: as Configurações mostravam um checklist do que faltava — "❌ TUYA_CLIENT_ID",
 * "❌ TUYA_CLIENT_SECRET" — e mandavam definir tudo isso "nas variáveis de ambiente do servidor".
 * Não havia um campo sequer para digitar, e no app instalado não existe .env que a pessoa possa
 * abrir: a instrução era literalmente impossível de cumprir. O app apontava o problema e não dava
 * caminho nenhum.
 *
 * Aqui o servidor de verdade sobe e as rotas são exercidas como a tela as usa. O que mais importa
 * é o que NÃO pode acontecer: o segredo que assina as requisições da Tuya não pode voltar para o
 * navegador em resposta nenhuma, e nada disso pode ser gravado por uma máquina de fora.
 *
 * Como rodar:
 *   node scripts/conferir-credenciais.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-cred-'));

/**
 * Porta livre escolhida na hora, e não um número fixo.
 *
 * Com porta fixa, um servidor sobrevivente de uma execução anterior continuava atendendo: as
 * consultas iam para ele, que já não tinha a pasta de dados, e o conferidor reprovava culpando o
 * recurso. O defeito era do conferidor.
 */
const PORTA = await new Promise((resolve) => {
  const t = net.createServer();
  t.listen(0, '127.0.0.1', () => {
    const p = t.address().port;
    t.close(() => resolve(p));
  });
});

// O servidor roda com a pasta temporária como diretório de trabalho: é lá que o arquivo de
// credenciais é gravado, então o teste não encosta em nada do projeto.
// 'detached' cria um grupo de processos próprio, para o encerramento levar junto o node que o
// tsx abre por baixo — matar só o processo de cima deixava o servidor vivo segurando a porta.
const servidor = spawn(process.execPath, [path.join(RAIZ, 'node_modules/tsx/dist/cli.mjs'), path.join(RAIZ, 'server.ts')], {
  cwd: pastaTemp,
  env: { ...process.env, PORT: String(PORTA), NODE_ENV: 'production', TUYA_BASE_URL: 'https://openapi.tuyaus.com' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true
});
let saida = '';
servidor.stdout.on('data', d => { saida += d; });
servidor.stderr.on('data', d => { saida += d; });

const base = `http://127.0.0.1:${PORTA}`;
const esperarServidor = async () => {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return true;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

const encerrar = (codigo) => {
  // O grupo inteiro, não só o processo de cima: é o filho que segura a porta.
  try { process.kill(-servidor.pid, 'SIGKILL'); } catch {}
  try { servidor.kill('SIGKILL'); } catch {}
  fs.rmSync(pastaTemp, { recursive: true, force: true });
  process.exit(codigo);
};

if (!(await esperarServidor())) {
  console.error('O servidor não subiu a tempo. Saída:\n' + saida.slice(-2000));
  encerrar(2);
}

const ARQUIVO = path.join(pastaTemp, 'credenciais-osone.json');
const SEGREDO = 'segredo-super-secreto-da-tuya-123456';

// 1) A tela precisa receber a lista de campos para desenhar os formulários.
{
  const r = await fetch(`${base}/api/credenciais`);
  const d = await r.json().catch(() => null);
  const nomes = (d?.campos || []).map(c => c.nome);
  const esperados = ['TUYA_CLIENT_ID', 'TUYA_CLIENT_SECRET', 'TUYA_BASE_URL', 'TUYA_USER_UID',
    'GOOGLE_HOME_CLIENT_ID', 'GOOGLE_HOME_CLIENT_SECRET'];
  const faltando = esperados.filter(n => !nomes.includes(n));
  registrar('a tela recebe os campos de Tuya E de Google Home para preencher',
    r.ok && faltando.length === 0,
    faltando.length ? `faltam: ${faltando.join(', ')}` : `${nomes.length} campos`);
}

// 2) Salvar pela tela precisa gravar de verdade.
{
  const r = await fetch(`${base}/api/credenciais`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TUYA_CLIENT_ID: 'meu-access-id', TUYA_CLIENT_SECRET: SEGREDO, TUYA_USER_UID: 'uid-123' })
  });
  const d = await r.json().catch(() => null);
  const gravado = fs.existsSync(ARQUIVO) ? JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8')) : {};
  registrar('preencher pela tela grava a credencial no servidor',
    r.ok && gravado.TUYA_CLIENT_SECRET === SEGREDO,
    r.ok ? `salvos: ${(d?.salvos || []).join(', ')}` : 'a rota recusou');
}

// 3) O SEGREDO NÃO PODE VOLTAR. É o que assina toda requisição da Tuya.
{
  const estado = await fetch(`${base}/api/credenciais`).then(r => r.text());
  const salvo = await fetch(`${base}/api/credenciais`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TUYA_CLIENT_ID: 'meu-access-id' })
  }).then(r => r.text());
  const vazou = estado.includes(SEGREDO) || salvo.includes(SEGREDO);
  registrar('o segredo da Tuya nunca volta para o navegador',
    !vazou,
    vazou ? 'VAZOU numa das respostas' : 'nem na leitura, nem na resposta do salvar');
}

// 4) O que volta é só o suficiente para reconhecer o valor.
{
  const d = await fetch(`${base}/api/credenciais`).then(r => r.json());
  const segredo = d.campos.find(c => c.nome === 'TUYA_CLIENT_SECRET');
  const naoSegredo = d.campos.find(c => c.nome === 'TUYA_CLIENT_ID');
  registrar('campo secreto volta mascarado, campo comum volta legível',
    segredo?.preenchido && segredo.amostra.includes('•') && segredo.amostra.endsWith(SEGREDO.slice(-4))
      && naoSegredo?.amostra === 'meu-access-id',
    `segredo "${segredo?.amostra}", id "${naoSegredo?.amostra}"`);
}

// 5) Vale NA HORA: a instrução antiga terminava em "e reinicie o OSONE".
{
  const d = await fetch(`${base}/api/tuya/status`).then(r => r.json());
  registrar('a credencial passa a valer sem reiniciar o servidor',
    d?.env?.clientId === true && d?.env?.clientSecret === true && d?.env?.userUid === true,
    JSON.stringify(d?.env));
}

// 6) Apagar o campo devolve o valor do ambiente, em vez de deixar um buraco.
{
  await fetch(`${base}/api/credenciais`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TUYA_BASE_URL: 'https://openapi.tuyaeu.com' })
  });
  const trocado = await fetch(`${base}/api/credenciais`).then(r => r.json());
  const doPainel = trocado.campos.find(c => c.nome === 'TUYA_BASE_URL');

  await fetch(`${base}/api/credenciais`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ TUYA_BASE_URL: '' })
  });
  const voltou = await fetch(`${base}/api/credenciais`).then(r => r.json());
  const doAmbiente = voltou.campos.find(c => c.nome === 'TUYA_BASE_URL');

  registrar('apagar o campo devolve o valor da variável de ambiente',
    doPainel?.origem === 'painel' && doPainel.amostra === 'https://openapi.tuyaeu.com'
      && doAmbiente?.origem === 'ambiente' && doAmbiente.amostra === 'https://openapi.tuyaus.com',
    `painel "${doPainel?.amostra}" -> ambiente "${doAmbiente?.amostra}"`);
}

// 7) O arquivo com o segredo não pode ficar legível para a máquina inteira.
{
  const modo = fs.statSync(ARQUIVO).mode & 0o777;
  const soDono = process.platform === 'win32' || modo === 0o600;
  registrar('o arquivo de credenciais é legível só pelo dono',
    soDono,
    process.platform === 'win32' ? 'Windows (sem modo POSIX)' : `modo ${modo.toString(8)}`);
}

// 8) Máquina de fora não grava credencial nenhuma.
{
  // A trava é por endereço de origem. Um pedido que chega com Host de fora continua vindo do
  // loopback neste teste, então o que se verifica é que a trava EXISTE nas duas rotas.
  const fonte = fs.readFileSync(path.join(RAIZ, 'server.ts'), 'utf-8');
  const trecho = fonte.slice(fonte.indexOf('app.get("/api/credenciais"'), fonte.indexOf('app.post("/api/gemini/generateContent"'));
  const travas = (trecho.match(/somenteDaPropriaMaquina\(req, res\)/g) || []).length;
  registrar('as duas rotas de credencial só respondem à própria máquina',
    travas === 2,
    `${travas} trava(s) encontradas (esperado 2)`);
}

// 9) O arquivo do segredo precisa estar fora do git.
{
  const ignore = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf-8');
  registrar('credenciais-osone.json está no .gitignore',
    ignore.includes('credenciais-osone.json'),
    ignore.includes('credenciais-osone.json') ? 'listado' : 'AUSENTE — o segredo iria para o repositório');
}

// 10) Nome de campo inventado não entra no arquivo.
{
  await fetch(`${base}/api/credenciais`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ CAMPO_INVENTADO: 'x', PATH: '/etc/passwd' })
  });
  const gravado = JSON.parse(fs.readFileSync(ARQUIVO, 'utf-8'));
  const sujou = 'CAMPO_INVENTADO' in gravado || 'PATH' in gravado;
  registrar('campo desconhecido é ignorado em vez de gravado',
    !sujou,
    sujou ? 'ENTROU no arquivo' : 'ignorado');
}

const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
encerrar(passaram === casos.length ? 0 : 1);
