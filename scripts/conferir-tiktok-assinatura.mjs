/**
 * Confere que o Co-piloto de TikTok Live conecta pelo caminho GRATUITO por padrão.
 *
 * Relatado assim: o terminal enchia de
 *
 *   [Empty Payload] [fetchWebcastSignatureFromEulerRoute] Failed to sign a request:
 *   This endpoint requires a Business plan.
 *
 * O erro não vinha do TikTok nem do OSONE, e sim da EulerStream — o serviço que o
 * `tiktok-live-connector` v2 usa obrigatoriamente para assinar toda URL de webcast. O detalhe que
 * fechava a conta: a rota de assinatura lê `sessionId`/`ttTargetIdc` do cookie jar e repassa para o
 * assinador, e assinar COM sessão é endpoint de plano Business. Ou seja, preencher o campo
 * "Session ID" — anunciado no painel como o jeito de escapar de bloqueio — era justamente o que
 * derrubava a conexão antes dela começar. E a dica impressa no erro mandava preencher o Session ID.
 *
 * O rótulo "Empty Payload" também enganava: é só o nome da classe de erro da lib
 * (`SignatureMissingTokensError`), não um payload vazio de verdade.
 *
 * Como rodar:
 *   node scripts/conferir-tiktok-assinatura.mjs
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const casos = [];
const registrar = (nome, passou, detalhe) => {
  casos.push({ nome, passou });
  console.log(`${passou ? '  ok  ' : 'FALHOU'}  ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
};

const servidor = fs.readFileSync(path.join(RAIZ, 'server.ts'), 'utf-8');
const painel = fs.readFileSync(path.join(RAIZ, 'src/components/TikTokLivePanel.tsx'), 'utf-8');

// Recorta só a função de conexão, para as buscas não pegarem trecho de outro assunto.
const inicio = servidor.indexOf('async function connectToTikTokLive');
const fim = servidor.indexOf('async function disconnectFromTikTokLive');
const conectar = servidor.slice(inicio, fim);

registrar('a função de conexão foi encontrada no servidor', inicio > 0 && fim > inicio);

// ====== PARTE 1: sem chave paga, a credencial não pode ir para o assinador ======

registrar('a credencial só é montada quando existe chave de assinatura paga',
  /const signApiKey = \(process\.env\.TIKTOK_SIGN_API_KEY/.test(conectar)
  && /trimmedSessionId && signApiKey/.test(conectar),
  'sem essa trava o Session ID vai para a EulerStream e cai no endpoint de plano Business');

registrar('nenhum caminho monta `session` sem antes exigir a chave',
  (() => {
    const trechoSession = conectar.slice(conectar.indexOf('configOpts.session'));
    // `configOpts.session` precisa estar dentro do ramo que já confirmou a chave paga.
    const ramoPago = conectar.indexOf('trimmedSessionId && signApiKey');
    return ramoPago > 0 && conectar.indexOf('configOpts.session') > ramoPago && trechoSession.length > 0;
  })(),
  'o bloco `configOpts.session` tem que ficar depois da checagem de chave paga');

registrar('`authenticateWs` também está atrás da mesma trava',
  (() => {
    const trava = conectar.indexOf('trimmedSessionId && signApiKey');
    const auth = conectar.indexOf('configOpts.authenticateWs = true');
    return trava > 0 && auth > trava;
  })(),
  'autenticar o WebSocket é o mesmo recurso pago');

registrar('o modo gratuito avisa no terminal que ignorou o Session ID',
  /Modo gratuito: o Session ID foi ignorado/.test(conectar),
  'ignorar em silêncio deixaria o usuário sem entender por que a credencial não valeu');

// ====== PARTE 2: a dica do erro não pode mandar de volta para a causa ======

registrar('o erro não manda mais preencher o Session ID como solução genérica',
  !/Use o campo 'Session ID' ao lado para autenticar/.test(conectar),
  'essa dica levava exatamente de volta ao erro de plano pago');

registrar('falha por recurso pago recebe a saída certa: esvaziar os campos',
  /business plan/.test(conectar)
  && /Deixe os campos 'Session ID' e 'Target IDC' VAZIOS/.test(conectar));

registrar('falha por cota recebe a saída certa: esperar',
  /rate limit/.test(conectar) && /Limite de assinaturas gratuitas atingido/.test(conectar));

// ====== PARTE 3: o Target IDC é uma região, não o @ do canal ======

registrar('um Target IDC fora do formato derruba a credencial em vez de quebrar lá dentro',
  /\^\[a-z0-9-\]\{2,20\}\$/.test(conectar)
  && /precisa da região do datacenter/.test(conectar),
  'no relato o campo estava preenchido com o @ do canal');

// ====== PARTE 4: o terminal não pode repetir a mesma linha de erro ======

registrar('erros iguais e seguidos viram uma linha só',
  /tiktokEventLogs\[0\]\?\.message === message/.test(conectar),
  '"Problema de transporte de sockets" aparecia repetido e escondia a mensagem útil');

registrar('o handler de erro respeita o teto de 300 linhas do terminal',
  (() => {
    const trecho = conectar.slice(conectar.indexOf('ControlEvent.ERROR'));
    return /tiktokEventLogs\.length > 300/.test(trecho.slice(0, 1200));
  })());

// ====== PARTE 5: o painel não pode anunciar recurso pago como anti-bloqueio ======

registrar('o painel não vende mais o Session ID como solução de bloqueio',
  !/evita sombra e block/.test(painel),
  'no plano gratuito o campo não evita bloqueio nenhum — ele impede a conexão');

registrar('o painel avisa que os campos avançados exigem plano pago',
  /plano pago da EulerStream/.test(painel));

registrar('o campo Target IDC deixa claro que não é o nome do canal',
  /região, não o @ do canal/.test(painel));

// ====== RESULTADO ======
const falhas = casos.filter((c) => !c.passou);
console.log(`\n${casos.length - falhas.length}/${casos.length} conferências passaram.`);
if (falhas.length) {
  console.error(`\nFalhou: ${falhas.map((f) => f.nome).join(' | ')}`);
  process.exit(1);
}
console.log('Conexão de TikTok Live segue no caminho gratuito por padrão.');
