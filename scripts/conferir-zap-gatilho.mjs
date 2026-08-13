/**
 * Confere que desligar o comando "/osone" faz o robô responder TODO MUNDO — e não ninguém.
 *
 * Relatado assim: "quando eu desativo o botão do /osone, em vez de ele responder todo mundo, ele
 * não responde ninguém". A regra de recepção no servidor estava certa; o defeito estava em como o
 * painel salvava:
 *
 * 1. Cada clique mandava a configuração INTEIRA que estava na tela. O painel só lê a configuração
 *    do servidor uma vez, ao abrir — se essa leitura falhar (OSONE ainda subindo, painel aberto
 *    pelo celular e recusado com 403, rede caindo), a tela fica com os valores de partida. Aí o
 *    clique em "desligar o /osone" levava junto "enabled: false" e "onlyKnownContacts: true",
 *    desligando o robô e ligando o filtro de contatos de brinde. Um interruptor mexido, três
 *    mudados — e silêncio total.
 * 2. As falhas eram silenciosas: um GET/POST recusado caía num "if (res.ok)" sem "else". O
 *    interruptor voltava sozinho e nada explicava o motivo.
 *
 * Como rodar:
 *   node scripts/conferir-zap-gatilho.mjs
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-zap-gatilho-'));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ====== PARTE 1: o painel não pode mandar a configuração inteira a cada clique ======
{
  const painel = fs.readFileSync(path.join(RAIZ, 'src/components/WhatsAppIntegration.tsx'), 'utf-8');

  registrar('o painel salva só o campo alterado, nunca a configuração inteira',
    !/JSON\.stringify\(\s*\{\s*\.\.\.config/.test(painel) && !/const toSave = \{ \.\.\.config/.test(painel),
    'um clique num interruptor não pode reescrever os outros ajustes');

  registrar('o painel avisa na tela quando não consegue ler ou salvar a configuração',
    /setConfigErro\(/.test(painel) && /configErro &&/.test(painel),
    'falha silenciosa deixava o usuário achando que o ajuste tinha sido aplicado');

  registrar('os interruptores ficam travados enquanto a configuração real não chega',
    /disabled=\{isSaving \|\| !configCarregada\}/.test(painel),
    'sem isso, o primeiro clique grava os valores de partida da tela por cima do robô');

  const padroesDoPainel = painel.match(/onlyKnownContacts: (true|false),\n\s*requireTriggerCommand: (true|false)/);
  registrar('os valores de partida do painel são iguais aos padrões do servidor',
    !!padroesDoPainel && padroesDoPainel[1] === 'false' && padroesDoPainel[2] === 'true',
    padroesDoPainel ? `onlyKnownContacts: ${padroesDoPainel[1]}` : 'não encontrados');
}

// ====== PARTE 2: o servidor, com o comando desligado, responde a qualquer número ======
{
  const PORTA = await new Promise((resolve) => {
    const t = net.createServer();
    t.listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => resolve(p)); });
  });

  const servidor = spawn(process.execPath, [path.join(RAIZ, 'node_modules/tsx/dist/cli.mjs'), path.join(RAIZ, 'server.ts')], {
    cwd: pastaTemp,
    env: { ...process.env, PORT: String(PORTA), NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  });
  servidor.stdout.on('data', () => {});
  servidor.stderr.on('data', () => {});

  const base = `http://127.0.0.1:${PORTA}`;
  let subiu = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { subiu = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  const salvar = async (mudancas) => {
    const res = await fetch(`${base}/api/whatsapp/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mudancas)
    });
    return (await res.json()).config;
  };
  const diagnosticar = async (numero, texto) => {
    const res = await fetch(`${base}/api/whatsapp/diagnostico-recepcao?numero=${numero}&texto=${encodeURIComponent(texto)}`);
    const dados = await res.json();
    const porta = (nome) => dados.portas.find(p => p.porta === nome);
    return { dados, porta };
  };

  if (!subiu) {
    registrar('o servidor sobe para conferir a recepção', false, 'o servidor não subiu');
  } else {
    // Ponto de partida: robô ligado, atendendo qualquer número, exigindo o comando.
    await salvar({ enabled: true, onlyKnownContacts: false, requireTriggerCommand: true, triggerCommand: '/osone', geminiApiKey: 'AIzaSyChaveDeTesteParaConferencia1234567' });

    // 1) Com o comando exigido, quem não escreve "/osone" é ignorado (o comportamento normal).
    {
      const { porta } = await diagnosticar('5511987654321', 'oi, quanto custa?');
      registrar('com o comando exigido, mensagem sem "/osone" é ignorada',
        porta('Comando de ativação').passa === false,
        porta('Comando de ativação').detalhe);
    }

    // 2) O clique que desliga o comando manda SÓ esse campo — e não pode derrubar mais nada.
    const depois = await salvar({ requireTriggerCommand: false });
    registrar('desligar o comando não desliga o robô junto',
      depois.enabled === true,
      `enabled ficou ${depois.enabled}`);
    registrar('desligar o comando não liga o filtro de contatos junto',
      depois.onlyKnownContacts === false,
      `onlyKnownContacts ficou ${depois.onlyKnownContacts}`);
    registrar('desligar o comando não apaga a chave do Gemini já salva',
      depois.geminiApiKeyInfo?.configurada === true,
      depois.geminiApiKeyInfo?.previa || 'chave sumiu');

    // 3) O que o usuário espera: sem o comando, um número qualquer é atendido.
    {
      const { porta } = await diagnosticar('5511987654321', 'oi, quanto custa?');
      const comando = porta('Comando de ativação');
      const contatos = porta('Filtro de contatos salvos');
      const ligado = porta('Robô ligado');
      registrar('com o comando desligado, qualquer número é respondido',
        comando.passa === true && contatos.passa === true && ligado.passa === true,
        `robô: ${ligado.passa ? 'ligado' : 'DESLIGADO'}, contatos: ${contatos.passa ? 'passa' : 'BLOQUEIA'}, comando: ${comando.passa ? 'passa' : 'BLOQUEIA'}`);
    }

    // 4) O gatilho continua funcionando quando é religado — desligar não pode ser um caminho sem volta.
    {
      await salvar({ requireTriggerCommand: true });
      const { porta } = await diagnosticar('5511987654321', 'oi /osone tudo bem?');
      registrar('religar o comando volta a filtrar, e quem escreve "/osone" passa',
        porta('Comando de ativação').passa === true,
        porta('Comando de ativação').detalhe);
    }

    // 4.1) Em áudio, a pessoa fala "OSONE" — ela não fala "barra osone". O servidor precisa
    // reconhecer essa chamada natural quando o comando padrão continua sendo "/osone".
    {
      const { porta } = await diagnosticar('5511987654321', '[Mensagem de voz do cliente]: osone qual é o plano plus?');
      registrar('áudio transcrito aceita "osone" falado como gatilho do comando padrão',
        porta('Comando de ativação').passa === true && /qual é o plano plus/.test(porta('Comando de ativação').detalhe),
        porta('Comando de ativação').detalhe);
    }

    // 4.2) Alguns transcritores podem ouvir o nome como "Ozone"; também aceitamos essa grafia
    // só no comando padrão, para a conversa por áudio não morrer por uma transcrição fonética.
    {
      const { porta } = await diagnosticar('5511987654321', '[Mensagem de voz do cliente]: Ozone me responde por áudio');
      registrar('áudio transcrito aceita "Ozone" como variação fonética de OSONE',
        porta('Comando de ativação').passa === true && /me responde por áudio/.test(porta('Comando de ativação').detalhe),
        porta('Comando de ativação').detalhe);
    }

    // 4.3) Estas duas grafias vieram de transcrições reais do WhatsApp. Elas precisam acionar
    // o robô, ou a mesma pessoa funciona num áudio e fica sem resposta no seguinte.
    for (const [grafia, pedido] of [['Ozoni', 'você está aí?'], ['Ozzone', 'me explica o plano pro']]) {
      const { porta } = await diagnosticar('5511987654321', `[Mensagem de voz do cliente]: ${grafia}, ${pedido}`);
      registrar(`áudio transcrito aceita "${grafia}" como variação fonética de OSONE`,
        porta('Comando de ativação').passa === true && porta('Comando de ativação').detalhe.includes(pedido),
        porta('Comando de ativação').detalhe);
    }

    // 5) O log de configurações precisa contar quem está calando o robô.
    {
      await salvar({ enabled: false });
      const logs = await (await fetch(`${base}/api/whatsapp/logs`)).json();
      const ultimo = logs.find(l => String(l.message).startsWith('Configurações salvas'));
      registrar('o log de configurações mostra as três travas, não só "Ativado/Desativado"',
        !!ultimo && /Comando de ativação/.test(ultimo.message) && /Filtro de contatos/.test(ultimo.message),
        ultimo ? ultimo.message.slice(0, 120) : 'nenhum log de configuração encontrado');
    }
  }

  try { process.kill(-servidor.pid, 'SIGKILL'); } catch {}
  try { servidor.kill('SIGKILL'); } catch {}
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
