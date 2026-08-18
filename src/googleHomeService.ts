import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getTuyaDevices, getDeviceStatus, sendDeviceCommand, explicarErroTuya } from './tuyaService';
import {
  RecursosDoAparelho,
  brilhoEmPorcento,
  corDoAparelhoParaGoogle,
  corDoGoogleParaHex,
  ehFechadura,
  montarComandos,
  recursosDosDps
} from './lib/tuyaDispositivos';

export interface GoogleHomeDeviceBackend {
  getTuyaDevices(): Promise<any>;
  getDeviceStatus(deviceId: string): Promise<any>;
  sendDeviceCommand(deviceId: string, commands: Array<{ code: string; value: any }>): Promise<any>;
}

const backendLocal: GoogleHomeDeviceBackend = {
  getTuyaDevices: () => getTuyaDevices(),
  getDeviceStatus,
  sendDeviceCommand
};

/**
 * Ponte real entre o Google Assistant/Google Home e os dispositivos Tuya já conectados no
 * OSONE. Implementa o fluxo OAuth de vínculo de conta e o webhook de fulfillment do Google
 * Smart Home (SYNC/QUERY/EXECUTE/DISCONNECT) exigidos pelo Actions on Google.
 *
 * Diferente da Tuya (API server-to-server simples com client_id/secret), o Google exige que
 * O PRÓPRIO USUÁRIO cadastre um projeto no Actions on Google Console e aponte para as rotas
 * deste servidor (authorize/token/fulfillment) — essa parte de configuração externa no Google
 * Cloud não pode ser feita por código, só pelo usuário no painel do Google.
 *
 * O QUE O ASSISTENTE ALCANÇA É O MESMO QUE O PAINEL ALCANÇA. Esta ponte não tem tradução
 * própria de aparelho: ela lê os recursos com `recursosDosDps` e monta os comandos com
 * `montarComandos` — exatamente as funções que o painel do OSONE HOME e o chat usam. Enquanto
 * havia uma segunda lógica aqui dentro, ela expunha todo aparelho como um interruptor simples:
 * a lâmpada que o painel regulava em brilho e cor chegava ao Google só com liga/desliga, e
 * "Ok Google, deixa a sala em 30%" respondia que o aparelho não sabia fazer aquilo.
 */

const ARQUIVO_DE_TOKENS = () => path.join(process.cwd(), 'google-home-tokens.json');

interface TokenStore {
  authCodes: Record<string, { createdAt: number; used: boolean }>;
  accessTokens: Record<string, { refreshToken: string; expiresAt: number }>;
  refreshTokens: Record<string, { issuedAt: number }>;
  /**
   * Prova de que quem está aprovando o vínculo é o dono desta instalação, não um visitante
   * qualquer que alcançou a tela de consentimento. Sem isto, /api/google-home/approve emitia
   * o código de autorização para QUALQUER requisição com um redirect_uri válido do Google —
   * a tela HTML pedia o código, mas nada no servidor de fato o exigia. Mesma ideia do
   * pairingCode do modo nuvem (googleHomeCloudService.ts), só que guardado neste arquivo
   * local em vez do Firestore.
   */
  pairingCodes: Record<string, { expiresAt: number }>;
}

function loadTokenStore(): TokenStore {
  try {
    if (fs.existsSync(ARQUIVO_DE_TOKENS())) {
      const bruto = JSON.parse(fs.readFileSync(ARQUIVO_DE_TOKENS(), 'utf-8'));
      // Um arquivo truncado (queda de energia no meio da escrita) deixava campos ausentes, e o
      // primeiro Object.entries em cima de undefined derrubava toda requisição do Google.
      return {
        authCodes: bruto?.authCodes || {},
        accessTokens: bruto?.accessTokens || {},
        refreshTokens: bruto?.refreshTokens || {},
        pairingCodes: bruto?.pairingCodes || {}
      };
    }
  } catch (e) {
    console.error('Erro ao ler google-home-tokens.json:', e);
  }
  return { authCodes: {}, accessTokens: {}, refreshTokens: {}, pairingCodes: {} };
}

/**
 * Descarta códigos de autorização e access_tokens que já não valem mais.
 *
 * Sem isso o arquivo só crescia: todo código emitido ficava guardado para sempre (mesmo já
 * usado) e todo access_token vencido também. Como o arquivo é lido e interpretado a cada
 * requisição de fulfillment do Google, ele ia ficando mais lento e maior indefinidamente.
 */
function pruneTokenStore(store: TokenStore): TokenStore {
  const now = Date.now();
  const AUTH_CODE_TTL = 10 * 60 * 1000;

  for (const [code, entry] of Object.entries(store.authCodes)) {
    if (entry.used || now - entry.createdAt > AUTH_CODE_TTL) {
      delete store.authCodes[code];
    }
  }
  for (const [token, entry] of Object.entries(store.accessTokens)) {
    if (entry.expiresAt <= now) {
      delete store.accessTokens[token];
    }
  }
  for (const [codigo, entry] of Object.entries(store.pairingCodes || {})) {
    if (entry.expiresAt <= now) {
      delete store.pairingCodes[codigo];
    }
  }
  return store;
}

function saveTokenStore(store: TokenStore): void {
  try {
    // 0600 pelo mesmo motivo do arquivo de credenciais: quem tiver um destes access_tokens
    // comanda a casa inteira pelo webhook de fulfillment, sem passar por senha nenhuma.
    fs.writeFileSync(ARQUIVO_DE_TOKENS(), JSON.stringify(pruneTokenStore(store), null, 2), { encoding: 'utf-8', mode: 0o600 });
    try {
      fs.chmodSync(ARQUIVO_DE_TOKENS(), 0o600);
    } catch {
      // Windows não tem esse conceito de permissão; o arquivo fica na pasta de dados do usuário.
    }
  } catch (e) {
    console.error('Erro ao salvar google-home-tokens.json:', e);
  }
}

function getGoogleHomeEnv() {
  return {
    clientId: (process.env.GOOGLE_HOME_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GOOGLE_HOME_CLIENT_SECRET || '').trim(),
  };
}

export function checkGoogleHomeConfig() {
  const { clientId, clientSecret } = getGoogleHomeEnv();
  return {
    configured: !!clientId && !!clientSecret,
    env: { clientId: !!clientId, clientSecret: !!clientSecret }
  };
}

function normalizePairingCode(code: string): string {
  return String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

/**
 * Código de 8 caracteres exibido só para quem já alcança este servidor pela própria máquina
 * (rota GET /api/google-home/pairing-code, protegida por somenteDaPropriaMaquina em
 * server.ts). É a prova de dono que faltava: /approve passou a exigi-lo antes de emitir
 * qualquer código de autorização. Vale 10 minutos e é de uso único, mesmo padrão do
 * pairingCode do modo nuvem em googleHomeCloudService.ts.
 */
export function issueLocalPairingCode(): { code: string; expiresAt: number } {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from(crypto.randomBytes(8), byte => alphabet[byte % alphabet.length]).join('');
  const code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
  const expiresAt = Date.now() + 10 * 60 * 1000;

  const store = loadTokenStore();
  store.pairingCodes[normalizePairingCode(code)] = { expiresAt };
  saveTokenStore(store);
  return { code, expiresAt };
}

/**
 * Gera um código de autorização de curta duração (10 min) após o usuário aprovar o vínculo
 * na tela de consentimento local — só depois de confirmar o código de pareamento gerado pela
 * própria máquina (ver issueLocalPairingCode). Sem essa confirmação, qualquer requisição HTTP
 * a /api/google-home/approve com um redirect_uri válido do Google recebia um código de
 * autorização de volta, sem prova nenhuma de que quem pediu é o dono da casa.
 */
export function issueAuthCode(pairingCodeInformado: string): string {
  const normalized = normalizePairingCode(pairingCodeInformado);
  if (normalized.length !== 8) {
    throw new Error('Digite o código de 8 caracteres mostrado no OSONE (Ajustes > Google Home).');
  }

  const store = loadTokenStore();
  const entry = store.pairingCodes[normalized];
  if (!entry || entry.expiresAt <= Date.now()) {
    throw new Error('Código de pareamento inválido ou vencido. Gere um novo no OSONE (Ajustes > Google Home) e tente de novo.');
  }
  delete store.pairingCodes[normalized]; // uso único

  const code = crypto.randomBytes(24).toString('hex');
  store.authCodes[code] = { createdAt: Date.now(), used: false };
  saveTokenStore(store);
  return code;
}

/**
 * Troca um código de autorização (ou refresh_token) por um novo access_token, seguindo o
 * fluxo padrão OAuth 2.0 Authorization Code exigido pelo Google Account Linking.
 */
export function exchangeToken(params: { grantType: string; code?: string; refreshToken?: string; clientId: string; clientSecret: string }) {
  const { clientId: expectedId, clientSecret: expectedSecret } = getGoogleHomeEnv();
  if (!expectedId || !expectedSecret) {
    throw new Error('GOOGLE_HOME_CLIENT_ID/GOOGLE_HOME_CLIENT_SECRET não configurados no servidor.');
  }
  if (params.clientId !== expectedId || params.clientSecret !== expectedSecret) {
    throw new Error('client_id ou client_secret inválidos.');
  }

  const store = loadTokenStore();

  if (params.grantType === 'authorization_code') {
    const codeEntry = params.code ? store.authCodes[params.code] : undefined;
    if (!codeEntry || codeEntry.used) {
      throw new Error('Código de autorização inválido, expirado ou já utilizado.');
    }
    if (Date.now() - codeEntry.createdAt > 10 * 60 * 1000) {
      throw new Error('Código de autorização expirado (validade de 10 minutos).');
    }
    codeEntry.used = true;

    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresIn = 3600;
    store.accessTokens[accessToken] = { refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
    store.refreshTokens[refreshToken] = { issuedAt: Date.now() };
    saveTokenStore(store);

    return { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn, refresh_token: refreshToken };
  }

  if (params.grantType === 'refresh_token') {
    if (!params.refreshToken || !store.refreshTokens[params.refreshToken]) {
      throw new Error('refresh_token inválido ou desconhecido.');
    }
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresIn = 3600;
    store.accessTokens[accessToken] = { refreshToken: params.refreshToken, expiresAt: Date.now() + expiresIn * 1000 };
    saveTokenStore(store);

    return { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn };
  }

  throw new Error(`grant_type '${params.grantType}' não suportado (use authorization_code ou refresh_token).`);
}

/**
 * Valida um access_token recebido no header Authorization do webhook de fulfillment.
 */
export function isValidAccessToken(token: string): boolean {
  if (!token) return false;
  const store = loadTokenStore();
  const entry = store.accessTokens[token];
  if (!entry) return false;
  return entry.expiresAt > Date.now();
}

export function revokeAllTokens(): void {
  saveTokenStore({ authCodes: {}, accessTokens: {}, refreshTokens: {}, pairingCodes: {} });
}

/**
 * Se existe ou não uma conta do Google vinculada a este OSONE.
 *
 * Sem isto, a única coisa que a tela sabia dizer era se o par client_id/secret estava
 * preenchido — que é a metade fácil. Quem preenchia os dois e nunca concluía o "Vincular conta"
 * no app Google Home via "Configurado no Servidor" em verde e ficava sem entender por que o
 * Assistente respondia que não encontrava nenhum aparelho. São dois estados diferentes, e agora
 * a tela mostra os dois.
 *
 * O refresh_token é o que marca o vínculo: ele nasce na conclusão do fluxo e vale até o usuário
 * desvincular. O access_token vence em uma hora e some sozinho — contá-lo diria "desvinculado"
 * para quem está apenas há mais de uma hora sem falar com o Assistente.
 */
export function lerEstadoDoVinculo(): { vinculado: boolean; vinculos: number; vinculadoEm: number | null; sessoesAtivas: number } {
  const store = pruneTokenStore(loadTokenStore());
  const refresh = Object.values(store.refreshTokens);
  return {
    vinculado: refresh.length > 0,
    vinculos: refresh.length,
    vinculadoEm: refresh.length > 0 ? Math.min(...refresh.map(r => r.issuedAt || 0)) : null,
    sessoesAtivas: Object.keys(store.accessTokens).length
  };
}

// ============================================================================
// Mapeamento de dispositivos Tuya <-> esquema do Google Smart Home
// ============================================================================

/**
 * O tipo do aparelho decide o ícone e o vocabulário que o Assistente aceita: numa LIGHT ele
 * entende "acende a sala", num OUTLET entende "liga a tomada". Tudo que caía no padrão
 * SWITCH — inclusive toda lâmpada que não fosse da categoria 'dj' — perdia isso.
 */
const TIPO_POR_CATEGORIA: Record<string, string> = {
  dj: 'LIGHT',     // lâmpada
  dd: 'LIGHT',     // fita de LED
  dc: 'LIGHT',     // cordão de luz
  xdd: 'LIGHT',    // luminária de teto
  fwd: 'LIGHT',    // luz ambiente
  tyndj: 'LIGHT',  // luz solar
  gyd: 'LIGHT',    // luz noturna
  fsd: 'FAN',      // ventilador de teto com luz
  fs: 'FAN',       // ventilador
  cz: 'OUTLET',    // tomada
  pc: 'OUTLET',    // régua de tomadas
  kg: 'SWITCH',    // interruptor
  tdq: 'SWITCH'    // disjuntor inteligente
};

function tipoDoGoogle(categoria: string): string {
  return TIPO_POR_CATEGORIA[(categoria || '').toLowerCase().trim()] || 'SWITCH';
}

export interface AparelhoParaGoogle {
  id: string;
  nome: string;
  categoria: string;
  online: boolean;
  /** Sem o prefixo 'action.devices.types.', para caber na tela do painel. */
  tipo: string;
  /** Sem o prefixo 'action.devices.traits.', pelo mesmo motivo. */
  traits: string[];
  recursos: RecursosDoAparelho;
}

export interface MapaParaGoogle {
  expostos: AparelhoParaGoogle[];
  /** O que ficou de fora e por quê — para a tela poder dizer, em vez de o aparelho sumir calado. */
  ignorados: Array<{ id: string; nome: string; motivo: string }>;
}

/**
 * Traduz a conta Tuya inteira no que o Google Assistant vai enxergar.
 *
 * Uma função só, usada pelo SYNC, pelo EXECUTE e pela tela de diagnóstico, porque as três
 * precisam concordar: um aparelho que o SYNC anuncia e o EXECUTE recusa é pior do que um
 * aparelho que nunca apareceu.
 *
 * FECHADURA NÃO ENTRA. Esta é a regra de segurança que o OSONE já aplicava no chat e no painel
 * — comando de voz nunca abre trava, e no painel a fechadura exige confirmação humana no
 * modal. A ponte do Google ignorava isso e entregava a fechadura como um interruptor comum:
 * quem estivesse perto de qualquer aparelho com Assistente podia mandar destrancar falando, e
 * a confirmação que existe no resto do sistema não era nem consultada. Cair no padrão SWITCH
 * era o bastante para abrir esse buraco sozinho.
 */
export async function mapearAparelhosParaGoogle(backend: GoogleHomeDeviceBackend = backendLocal): Promise<MapaParaGoogle> {
  const devices = await backend.getTuyaDevices();
  const lista: any[] = Array.isArray(devices) ? devices : [];

  const expostos: AparelhoParaGoogle[] = [];
  const ignorados: MapaParaGoogle['ignorados'] = [];

  for (const d of lista) {
    const nome = d?.name || d?.id;

    if (ehFechadura(d?.category)) {
      ignorados.push({
        id: d.id,
        nome,
        motivo: 'É uma fechadura. Por segurança, o OSONE nunca entrega trava ao comando de voz — ela só é acionada pelo chat de texto, com confirmação humana explícita.'
      });
      continue;
    }

    // A lista da Tuya já costuma trazer os pontos de dados; a consulta por aparelho é o plano B.
    let dps: any[] = Array.isArray(d?.status) ? d.status : [];
    if (dps.length === 0) {
      try {
        const st = await backend.getDeviceStatus(d.id);
        dps = Array.isArray(st) ? st : [];
      } catch (err: any) {
        ignorados.push({ id: d.id, nome, motivo: `Não foi possível ler o que este aparelho aceita (${err?.message || err}).` });
        continue;
      }
    }

    const recursos = recursosDosDps(dps);
    if (!recursos.liga) {
      // Anunciar ao Google um aparelho sem liga/desliga legível seria prometer um controle que o
      // EXECUTE vai ter de recusar depois — e o Assistente já teria dito "ok".
      ignorados.push({ id: d.id, nome, motivo: 'Não expõe um liga/desliga que o OSONE saiba usar (sensores e aparelhos só de leitura caem aqui).' });
      continue;
    }

    const traits = ['OnOff'];
    if (recursos.brilho) traits.push('Brightness');
    if (recursos.cor) traits.push('ColorSetting');

    expostos.push({
      id: d.id,
      nome,
      categoria: d.category || '',
      online: d.online !== false,
      tipo: tipoDoGoogle(d.category),
      traits,
      recursos
    });
  }

  return { expostos, ignorados };
}

export async function handleSync(backend: GoogleHomeDeviceBackend = backendLocal): Promise<any> {
  const { expostos } = await mapearAparelhosParaGoogle(backend);
  return {
    devices: expostos.map(a => {
      const dispositivo: any = {
        id: a.id,
        type: `action.devices.types.${a.tipo}`,
        traits: a.traits.map(t => `action.devices.traits.${t}`),
        name: { name: a.nome },
        // O OSONE não tem como avisar o Google por conta própria quando alguém aperta o
        // interruptor na parede: o Report State exige uma chave de conta de serviço do Google
        // Cloud que só o usuário pode emitir. Declarar `false` é o que faz o Assistente
        // PERGUNTAR o estado (QUERY) antes de responder, em vez de repetir um valor guardado.
        willReportState: false,
        deviceInfo: { manufacturer: 'Tuya (via OSONE)', model: a.categoria || 'unknown' }
      };
      // 'hsv' porque é o formato que a Tuya guarda; anunciar 'rgb' faria o Google mandar a cor
      // numa representação que a conversão daqui não espera.
      if (a.traits.includes('ColorSetting')) dispositivo.attributes = { colorModel: 'hsv' };
      return dispositivo;
    })
  };
}

export async function handleQuery(deviceIds: string[], backend: GoogleHomeDeviceBackend = backendLocal): Promise<any> {
  const devices: Record<string, any> = {};

  for (const id of deviceIds) {
    try {
      // Estado lido do aparelho AGORA: o QUERY é justamente a pergunta "como está neste
      // instante", e um interruptor apertado na parede não passa por lugar nenhum daqui.
      const status = await backend.getDeviceStatus(id);
      const recursos = recursosDosDps(Array.isArray(status) ? status : []);

      if (!recursos.liga) {
        // Respondeu, mas não expõe um liga/desliga que saibamos ler: está online, e dizemos que
        // não conseguimos determinar o estado em vez de inventar "desligado".
        devices[id] = { status: 'ERROR', online: true, errorCode: 'functionNotSupported' };
        continue;
      }

      const estado: any = { status: 'SUCCESS', online: true, on: recursos.liga.ligado };

      const brilho = brilhoEmPorcento(recursos.brilho);
      if (brilho !== undefined) estado.brightness = brilho;

      const cor = corDoAparelhoParaGoogle(recursos.cor);
      if (cor) estado.color = { spectrumHsv: cor };

      devices[id] = estado;
    } catch (err: any) {
      // A consulta falhou de fato (aparelho fora do ar, erro de credencial, timeout). Antes
      // este caso era praticamente inalcançável e o aparelho aparecia no Google Home como
      // conectado e desligado, escondendo o problema real.
      console.error(`[Google Home] Falha ao consultar o dispositivo ${id}:`, err?.message || err);
      devices[id] = { status: 'OFFLINE', online: false };
    }
  }

  return { devices };
}

/**
 * Traduz um comando do Google na ação que `montarComandos` entende — a mesma que o painel e o
 * chat usam. Devolve `null` para comando que esta ponte não implementa.
 */
function acaoDoComandoDoGoogle(comando: string, params: any):
  | { acao: string; valor?: any; cor?: any; estado: Record<string, any> }
  | null {
  if (comando === 'action.devices.commands.OnOff') {
    const ligado = !!params?.on;
    return { acao: ligado ? 'turn_on' : 'turn_off', estado: { on: ligado } };
  }

  if (comando === 'action.devices.commands.BrightnessAbsolute') {
    const brilho = Number(params?.brightness);
    if (!Number.isFinite(brilho)) return null;
    return { acao: 'set_value', valor: brilho, estado: { brightness: brilho, on: true } };
  }

  if (comando === 'action.devices.commands.ColorAbsolute') {
    // O Google manda 'spectrumHSV' no EXECUTE e espera 'spectrumHsv' de volta no QUERY. A
    // diferença de maiúsculas é dele, e ler só uma das duas grafias deixava a cor cair fora.
    const hsv = params?.color?.spectrumHSV || params?.color?.spectrumHsv;
    const hex = corDoGoogleParaHex(hsv);
    if (!hex) return null;
    return { acao: 'set_color', cor: hex, estado: { color: { spectrumHsv: hsv }, on: true } };
  }

  return null;
}

export async function handleExecute(
  commands: Array<{ devices: Array<{ id: string }>; execution: Array<{ command: string; params?: any }> }>,
  backend: GoogleHomeDeviceBackend = backendLocal
): Promise<any> {
  const commandResults: any[] = [];

  // Um levantamento só para a requisição inteira, e é ele que autoriza: aparelho que não está
  // na lista de expostos não é comandado, ponto. É assim que a fechadura continua fora mesmo se
  // o Google mandar o id dela por ter guardado um SYNC antigo — sem isto, o EXECUTE falaria
  // direto com a Tuya, por fora da trava que o resto do OSONE aplica.
  let mapa: MapaParaGoogle | null = null;
  let erroDoMapa = '';
  try {
    mapa = await mapearAparelhosParaGoogle(backend);
  } catch (err: any) {
    erroDoMapa = String(err?.message || err);
    console.error('[Google Home] Não foi possível levantar os aparelhos da conta Tuya:', erroDoMapa);
  }

  for (const cmd of commands) {
    for (const device of cmd.devices) {
      for (const execution of cmd.execution) {
        if (!mapa) {
          commandResults.push({
            ids: [device.id],
            status: 'ERROR',
            errorCode: /não configurad|credenciais|client_id|client_secret|TUYA_/i.test(erroDoMapa) ? 'authFailure' : 'deviceOffline'
          });
          continue;
        }

        const alvo = mapa.expostos.find(a => a.id === device.id);
        if (!alvo) {
          const ignorado = mapa.ignorados.find(i => i.id === device.id);
          if (ignorado) console.warn(`[Google Home] Comando recusado em ${device.id}: ${ignorado.motivo}`);
          // 'deviceNotFound' faz o Google tirar o aparelho da casa do usuário, que é o certo
          // para algo que o SYNC não anuncia mais.
          commandResults.push({ ids: [device.id], status: 'ERROR', errorCode: 'deviceNotFound' });
          continue;
        }

        const traduzido = acaoDoComandoDoGoogle(execution.command, execution.params);
        if (!traduzido) {
          commandResults.push({ ids: [device.id], status: 'ERROR', errorCode: 'functionNotSupported' });
          continue;
        }

        // A recusa vem do que o aparelho REALMENTE tem. Antes, o EXECUTE mandava 'switch_1' para
        // qualquer coisa e informava SUCCESS: o Assistente respondia "ok, liguei", o aparelho não
        // mexia, e a resposta ainda envenenava o estado que o Google guarda.
        const montagem = montarComandos(alvo.recursos, traduzido.acao, traduzido.valor, traduzido.cor);
        if ('falha' in montagem) {
          console.warn(`[Google Home] ${alvo.nome}: ${montagem.falha}`);
          commandResults.push({ ids: [device.id], status: 'ERROR', errorCode: 'functionNotSupported' });
          continue;
        }

        try {
          await backend.sendDeviceCommand(device.id, montagem.comandos);
          commandResults.push({ ids: [device.id], status: 'SUCCESS', states: { online: true, ...traduzido.estado } });
        } catch (err: any) {
          // Antes qualquer falha virava "deviceOffline", escondendo erro de credencial ou de
          // configuração atrás de uma mensagem de aparelho desligado. Agora o motivo real é
          // registrado e o código devolvido ao Google corresponde ao que de fato aconteceu.
          const msg = String(err?.message || err);
          console.error(`[Google Home] Falha ao executar comando em ${device.id}:`, msg);
          const errorCode = /não configurad|credenciais|client_id|client_secret|TUYA_/i.test(msg)
            ? 'authFailure'
            : /timeout/i.test(msg)
              ? 'deviceNotResponding'
              : 'deviceOffline';
          commandResults.push({ ids: [device.id], status: 'ERROR', errorCode });
        }
      }
    }
  }

  return { commands: commandResults };
}

/**
 * DESVINCULAR DE VERDADE. O Google manda esta intent quando o usuário remove o OSONE no app
 * Google Home, e a resposta era um `{}` vazio: os tokens continuavam gravados e válidos aqui.
 * Desvincular pelo celular não desfazia nada — quem tivesse o access_token seguia comandando a
 * casa pelo webhook, e o usuário tinha todo motivo para acreditar que havia cortado o acesso.
 */
export function handleDisconnect(): void {
  revokeAllTokens();
  console.log('[Google Home] Conta desvinculada pelo usuário: todos os tokens foram revogados.');
}

/**
 * Diagnóstico de ponta a ponta, no mesmo espírito do `diagnosticarTuya`: em vez de dizer só se
 * os campos estão preenchidos, percorre a corrente inteira — credenciais, Tuya, vínculo — e
 * para no primeiro elo que falta, explicando o que fazer ali.
 */
export async function diagnosticarGoogleHome(): Promise<any> {
  const { configured } = checkGoogleHomeConfig();
  const vinculo = lerEstadoDoVinculo();

  if (!configured) {
    return {
      ok: false,
      etapa: 'credenciais',
      resumo: 'Falta o par Client ID / Client Secret do Google Home.',
      ...vinculo,
      configurado: false,
      expostos: [],
      ignorados: [],
      comoResolver:
        'Invente um Client ID e um Client Secret (qualquer texto longo serve — eles são seus, não do Google), ' +
        'preencha os dois aqui na aba Google Home e cole exatamente os mesmos valores em Account Linking, no seu ' +
        'projeto do Actions on Google Console.'
    };
  }

  let mapa: MapaParaGoogle;
  try {
    mapa = await mapearAparelhosParaGoogle();
  } catch (err: any) {
    const bruto = String(err?.message || err);
    return {
      ok: false,
      etapa: 'tuya',
      resumo: 'O Google Home está configurado, mas a conta Tuya não respondeu — e é dela que saem os aparelhos.',
      ...vinculo,
      configurado: true,
      expostos: [],
      ignorados: [],
      erroTecnico: bruto,
      comoResolver: explicarErroTuya(bruto)
    };
  }

  if (mapa.expostos.length === 0) {
    return {
      ok: false,
      etapa: 'aparelhos',
      resumo: 'Nenhum aparelho da sua conta pode ser entregue ao Assistente.',
      ...vinculo,
      configurado: true,
      expostos: [],
      ignorados: mapa.ignorados,
      comoResolver:
        'Só entram aparelhos com um liga/desliga que o OSONE consiga ler, e fechaduras nunca entram. ' +
        'A lista abaixo diz o motivo de cada um que ficou de fora.'
    };
  }

  if (!vinculo.vinculado) {
    return {
      ok: false,
      etapa: 'vinculo',
      resumo: `${mapa.expostos.length} aparelho(s) prontos, mas nenhuma conta do Google foi vinculada ainda.`,
      ...vinculo,
      configurado: true,
      expostos: mapa.expostos,
      ignorados: mapa.ignorados,
      comoResolver:
        'No app Google Home do celular: + > Configurar dispositivo > "Funciona com o Google", procure o seu ' +
        'projeto de teste e autorize na tela que o OSONE abrir. O vínculo só se conclui por aí — não há como ' +
        'fazê-lo a partir daqui.'
    };
  }

  return {
    ok: true,
    etapa: 'pronto',
    resumo: `Conta vinculada e ${mapa.expostos.length} aparelho(s) entregues ao Assistente.`,
    ...vinculo,
    configurado: true,
    expostos: mapa.expostos,
    ignorados: mapa.ignorados
  };
}
