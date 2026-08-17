/**
 * Confere que NUNCA existe mais de uma sessão de voz tocando ao mesmo tempo.
 *
 * O RELATO foi "ele tá falando com um monte de vozes ao mesmo tempo". A causa: onclose e onerror
 * descartavam eventos de sessão substituída, mas o onmessage — justamente por onde o ÁUDIO passa —
 * não conferia nada. Com duas sessões vivas, as duas recebiam respostas DIFERENTES e as duas
 * empurravam pedaços de áudio para o MESMO tocador, que os intercalava: um coro de vozes
 * sobrepostas falando coisas diferentes.
 *
 * O religamento automático do Modo Vigília transformou "duas sessões vivas" de acidente raro em
 * rotina de dez em dez minutos, e foi o que trouxe o defeito à tona.
 *
 * Como rodar:
 *   node scripts/conferir-uma-voz-so.mjs
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf8');

let ok = 0, falhou = 0;
const conferir = (nome, cond, detalhe = '') => {
  if (cond) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} ${detalhe}`); }
};

// ---------------------------------------------------------------------------
// 1. Simulação: duas sessões vivas, a antiga tentando tocar áudio.
// ---------------------------------------------------------------------------
console.log('\n=== SIMULAÇÃO: SESSÃO VELHA TENTA FALAR POR CIMA DA NOVA ===');

let geracao = 0;
const tocados = [];
const tocador = { playChunk: (voz) => tocados.push(voz) };

function abrirSessao(voz) {
  const minhaGeracao = ++geracao;
  const souAGeracaoAtual = () => minhaGeracao === geracao;
  return {
    voz,
    // Réplica do onmessage COM a trava (como ficou depois da correção)
    receberAudio: () => { if (!souAGeracaoAtual()) return; tocador.playChunk(voz); },
    // Como era ANTES: sem trava nenhuma
    receberAudioSemTrava: () => tocador.playChunk(voz)
  };
}

const sessaoA = abrirSessao('VOZ-A');
const sessaoB = abrirSessao('VOZ-B');   // religamento substitui a A

sessaoA.receberAudio();   // a velha tenta falar
sessaoB.receberAudio();   // a nova fala
sessaoA.receberAudio();   // a velha insiste
sessaoB.receberAudio();

conferir('só a sessão ATUAL toca áudio', tocados.every(v => v === 'VOZ-B'), JSON.stringify(tocados));
conferir('a sessão substituída fica muda', !tocados.includes('VOZ-A'), JSON.stringify(tocados));

// Controle: sem a trava, o coro reaparece — prova que a trava é o que resolve.
tocados.length = 0;
const c1 = abrirSessao('VOZ-A'); const c2 = abrirSessao('VOZ-B');
c1.receberAudioSemTrava(); c2.receberAudioSemTrava(); c1.receberAudioSemTrava();
const vozesDistintas = new Set(tocados).size;
conferir('(controle) sem a trava, duas vozes se intercalam', vozesDistintas === 2,
  `${vozesDistintas} voz(es): ${JSON.stringify(tocados)}`);

// ---------------------------------------------------------------------------
// 2. As travas precisam existir no código real, nos TRÊS callbacks.
// ---------------------------------------------------------------------------
console.log('\n=== TRAVAS NO CÓDIGO REAL (src/App.tsx) ===');

const trechoApos = (marcador, linhas) => {
  const i = fonte.indexOf(marcador);
  return i === -1 ? '' : fonte.slice(i, i + linhas);
};

conferir('onmessage (caminho do ÁUDIO) descarta sessão substituída',
  /souAGeracaoAtual\(\)\) return;/.test(trechoApos('onmessage: async (message)', 1200)));
conferir('onclose descarta sessão substituída',
  /souAGeracaoAtual\(\)\) \{/.test(trechoApos('onclose: () =>', 400)));
conferir('onerror descarta sessão substituída',
  /souAGeracaoAtual\(\)\) \{/.test(trechoApos('onerror: (error: any)', 400)));

conferir('subir uma sessão FECHA a anterior antes de trocar os aparelhos de áudio',
  /liveSessionRef\.current\?\.close\?\.\(\);[\s\S]{0,400}audioProcessorRef\.current\?\.stopRecording[\s\S]{0,200}audioPlayerRef\.current\?\.stop/
    .test(trechoApos('const minhaGeracao = ++geracaoDaSessaoDeVozRef.current;', 1600)));

conferir('o religamento não se apoia só no estado assíncrono (usa liveSessionRef)',
  /if \(liveSessionRef\.current\) return;/.test(trechoApos('religamentoDaVozRef.current = setTimeout', 900)));

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou > 0 ? 1 : 0);
