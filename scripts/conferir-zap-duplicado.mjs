/**
 * Confere que o OSONE ZAP não responde a mesma mensagem duas vezes.
 *
 * Relatado com print da conversa: o cliente recebeu o MESMO texto duas vezes, no mesmo minuto.
 * São duas causas somadas, e as duas produzem exatamente esse sintoma:
 *
 * 1. O Baileys pode entregar a MESMA mensagem mais de uma vez no evento 'messages.upsert', com o
 *    mesmo key.id — recibo de retentativa, reconexão com notificações pendentes, ou chegada por
 *    mais de um caminho. Não havia nenhuma trava por identificador.
 *
 * 2. Duas inicializações simultâneas criavam DOIS sockets vivos, e cada mensagem era entregue aos
 *    dois. A rota /api/whatsapp/connect só recusa quando o status já é "conectado", então clicar
 *    em "Iniciar Conexão" enquanto ela ainda está subindo começava uma segunda — e como o socket
 *    só é guardado DEPOIS de vários awaits, a limpeza do socket anterior não enxergava a
 *    inicialização a meio caminho, deixando o primeiro vivo para sempre.
 *
 * Como rodar:
 *   node scripts/conferir-zap-duplicado.mjs
 */
import { build } from 'esbuild';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-zap-'));

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

// ====== PARTE 1: a trava por identificador ======
{
  const saida = path.join(pastaTemp, 'naoRepetir.mjs');
  await build({
    entryPoints: [path.join(RAIZ, 'src/lib/naoRepetir.ts')],
    bundle: true, format: 'esm', outfile: saida,
    nodePaths: [path.join(RAIZ, 'node_modules')], absWorkingDir: RAIZ, logLevel: 'silent'
  });
  const { NaoRepetir } = await import('file://' + saida);

  // 1) A mesma mensagem chegando de novo é reconhecida.
  {
    const t = new NaoRepetir();
    const primeira = t.jaAtendido('ABC123');
    const segunda = t.jaAtendido('ABC123');
    const terceira = t.jaAtendido('ABC123');
    registrar('a mesma mensagem chegando de novo é reconhecida e ignorada',
      primeira === false && segunda === true && terceira === true,
      `1ª: ${primeira ? 'repetida' : 'nova'}, 2ª: ${segunda ? 'repetida' : 'NOVA (responderia de novo)'}`);
  }

  // 2) Mensagens diferentes continuam sendo atendidas — a trava não pode calar o atendimento.
  {
    const t = new NaoRepetir();
    const ids = ['A', 'B', 'C', 'D'];
    const repetidas = ids.filter(id => t.jaAtendido(id));
    registrar('mensagens diferentes continuam sendo atendidas',
      repetidas.length === 0, `${ids.length} mensagens novas, ${repetidas.length} barradas`);
  }

  // 3) Trava por ID, e NÃO por conteúdo: quem repete a pergunta porque não foi respondido
  //    precisa ser respondido. É o teste que impede alguém "otimizar" isto para comparar texto.
  {
    const t = new NaoRepetir();
    t.jaAtendido('msg-1');
    const outraIgual = t.jaAtendido('msg-2');
    registrar('duas mensagens iguais com IDs diferentes são duas mensagens',
      outraIgual === false, 'a segunda seria respondida normalmente');
  }

  // 4) Sem ID, nunca considerar repetida: engolir mensagem legítima é pior que responder duas.
  {
    const t = new NaoRepetir();
    registrar('mensagem sem identificador nunca é tratada como repetida',
      t.jaAtendido('') === false && t.jaAtendido('') === false,
      'passa nas duas vezes');
  }

  // 5) A memória não cresce sem fim numa sessão de dias.
  {
    const t = new NaoRepetir(10);
    for (let i = 0; i < 100; i++) t.jaAtendido('id-' + i);
    const recente = t.jaAtendido('id-99');
    registrar('a memória de IDs tem teto e o mais recente continua protegido',
      t.tamanho <= 10 && recente === true,
      `${t.tamanho} IDs lembrados de 100 vistos`);
  }
}

// ====== PARTE 2: duas conexões simultâneas não podem criar dois sockets ======
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
  let saidaDoServidor = '';
  servidor.stdout.on('data', d => { saidaDoServidor += d; });
  servidor.stderr.on('data', d => { saidaDoServidor += d; });

  const base = `http://127.0.0.1:${PORTA}`;
  let subiu = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { subiu = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  if (!subiu) {
    registrar('duas conexões simultâneas não criam dois sockets', false, 'o servidor não subiu');
  } else {
    // Dois pedidos ao mesmo tempo, que é exatamente o caminho do defeito.
    await Promise.all([
      fetch(`${base}/api/whatsapp/connect`, { method: 'POST' }).catch(() => null),
      fetch(`${base}/api/whatsapp/connect`, { method: 'POST' }).catch(() => null)
    ]);
    await new Promise(r => setTimeout(r, 4000));

    const recusouASegunda = /Já existe uma conexão sendo iniciada/.test(saidaDoServidor);
    registrar('duas conexões pedidas ao mesmo tempo: a segunda é recusada',
      recusouASegunda,
      recusouASegunda ? 'a segunda inicialização foi ignorada' : 'as DUAS seguiram — dois sockets, duas respostas por mensagem');
  }

  try { process.kill(-servidor.pid, 'SIGKILL'); } catch {}
  try { servidor.kill('SIGKILL'); } catch {}
}

fs.rmSync(pastaTemp, { recursive: true, force: true });
const passaram = casos.filter(c => c.passou).length;
console.log(`\n${passaram}/${casos.length} conferências passaram.`);
process.exit(passaram === casos.length ? 0 : 1);
