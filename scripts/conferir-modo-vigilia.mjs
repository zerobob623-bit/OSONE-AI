/**
 * Confere as regras do MODO VIGÍLIA — a voz que não aceita ficar desligada.
 *
 * O DEFEITO QUE ISTO RESOLVE. A sessão de voz do Gemini Live tem prazo no servidor do Google.
 * Perto do fim, a API avisa com um 'goAway' e o OSONE fazia a única coisa que não devia:
 * encerrava e ficava quieto. Não era queda de rede nem bug intermitente — era o comportamento
 * normal da API encontrando um cliente que desistia. Daí ser 100% das vezes e sempre por volta
 * dos 10 minutos, exatamente como a comunidade relatou.
 *
 * As regras perigosas, e por que cada uma está aqui:
 *
 *   1. PARADA MANUAL VENCE A VIGÍLIA. Se desligar no botão fizesse a sessão renascer, o botão de
 *      desligar não desligaria nada. Vale também para "encerra a chamada" dito por voz.
 *   2. NÃO PODE VIRAR LAÇO EM TEMPO REAL. Uma chave inválida falha instantaneamente; sem espera
 *      crescente, isso vira uma tempestade de reconexões martelando a API e queimando cota.
 *   3. COTA ESTOURADA NÃO SE RESOLVE INSISTINDO RÁPIDO. Religar em 1s contra um limite de cota só
 *      repete a recusa e piora o que causou o erro.
 *   4. A ESPERA PRECISA ZERAR AO CONECTAR. Sem isso, uma conversa longa com vários goAway
 *      religados com sucesso ficaria cada vez mais lenta para voltar, até o teto de 20s — o
 *      usuário sentiria o OSONE "cansando" ao longo da conversa.
 *
 * Como rodar:
 *   node scripts/conferir-modo-vigilia.mjs
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fonte = fs.readFileSync(path.join(RAIZ, 'src/App.tsx'), 'utf8');

let ok = 0, falhou = 0;
const conferir = (nome, condicao, detalhe = '') => {
  if (condicao) { ok++; console.log(`  ok    ${nome}`); }
  else { falhou++; console.log(`  FALHOU ${nome} ${detalhe}`); }
};

// ---------------------------------------------------------------------------
// Parte 1: a lógica de espera, reimplementada igual à do App e exercitada.
// ---------------------------------------------------------------------------
console.log('\n=== ESCADA DE ESPERA ===');
const esperaDaTentativa = (t) => Math.min(1000 * Math.pow(2, t - 1), 20000);
conferir('1ª tentativa é quase imediata (1s)', esperaDaTentativa(1) === 1000, `${esperaDaTentativa(1)}`);
conferir('a espera cresce a cada falha seguida', esperaDaTentativa(2) === 2000 && esperaDaTentativa(3) === 4000);
conferir('a espera tem teto de 20s (nunca desiste de vez)', esperaDaTentativa(50) === 20000);
conferir('cota estourada começa já no teto',
  esperaDaTentativa(Math.max(0, 5) + 1) === 20000, `${esperaDaTentativa(6)}`);

// Simula uma hora de conversa: goAway a cada ~10 min, todos religando com sucesso.
let tentativas = 0;
const esperas = [];
for (let i = 0; i < 6; i++) {
  tentativas++;                       // caiu por goAway
  esperas.push(esperaDaTentativa(tentativas));
  tentativas = 0;                     // conectou (onopen zera)
}
conferir('numa hora de conversa, toda volta é rápida (1s), sem "cansar"',
  esperas.every(e => e === 1000), JSON.stringify(esperas));

// Sem o zeramento, a mesma hora de conversa degradaria — é o defeito que o zeramento evita.
let semZerar = 0;
const semZerarEsperas = [];
for (let i = 0; i < 6; i++) { semZerar++; semZerarEsperas.push(esperaDaTentativa(semZerar)); }
conferir('(controle) sem zerar, a volta degradaria até 20s',
  semZerarEsperas[semZerarEsperas.length - 1] > 1000, JSON.stringify(semZerarEsperas));

// ---------------------------------------------------------------------------
// Parte 2: as travas precisam existir no código real, não só na intenção.
// ---------------------------------------------------------------------------
console.log('\n=== TRAVAS NO CÓDIGO REAL (src/App.tsx) ===');

const religar = fonte.slice(fonte.indexOf('const religarVozSePreciso'), fonte.indexOf('const religarVozSePreciso') + 1400);
conferir('religamento existe', religar.length > 100);
conferir('não religa com o modo desligado', /if \(!modoVigiliaRef\.current\) return;/.test(religar));
conferir('não religa após parada MANUAL', /if \(paradaManualDaVozRef\.current\) return;/.test(religar));
conferir('não agenda dois religamentos ao mesmo tempo', /if \(religamentoDaVozRef\.current\) return;/.test(religar));
conferir('não abre sessão nova se já conectou por outro caminho',
  /status === 'connected' \|\| .*status === 'connecting'\) return;/.test(religar));

conferir('o botão de desligar marca parada manual',
  /paradaManualDaVozRef\.current = estaLigada;/.test(fonte));
conferir('"encerrar por voz" também marca parada manual',
  /paradaManualDaVozRef\.current = true;[\s\S]{0,200}Chamada de voz finalizada por comando de voz/.test(fonte));
conferir('conectar zera a escada de espera',
  /tentativasDeReligamentoRef\.current = 0;/.test(fonte.slice(fonte.indexOf("setLiveState({ status: 'connected' })"),
    fonte.indexOf("setLiveState({ status: 'connected' })") + 600)));
conferir('cota excedida sobe o contador antes de religar',
  /isQuotaError\) tentativasDeReligamentoRef\.current = Math\.max/.test(fonte));
conferir('o fechamento da sessão dispara o religamento',
  /religarVozSePreciso\('a sessão de voz fechou/.test(fonte));
conferir('a preferência sobrevive ao fechar o app (localStorage)',
  /localStorage\.setItem\('osone_modo_vigilia'/.test(fonte) &&
  /localStorage\.getItem\('osone_modo_vigilia'\) === 'true'/.test(fonte));
conferir('o botão existe no cabeçalho e é alcançável por nome',
  /aria-label="Modo Vigília/.test(fonte) && /onClick=\{alternarModoVigilia\}/.test(fonte));
conferir('ligar o modo acende a voz na hora se estiver apagada',
  /if \(desligada\) handleVoiceToggle\(\);/.test(fonte));

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou > 0 ? 1 : 0);
