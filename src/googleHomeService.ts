import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getTuyaDevices, getDeviceStatus, sendDeviceCommand } from './tuyaService';

/**
 * Ponte real entre o Google Assistant/Google Home e os dispositivos Tuya já conectados no
 * OSONE. Implementa o fluxo OAuth de vínculo de conta e o webhook de fulfillment do Google
 * Smart Home (SYNC/QUERY/EXECUTE/DISCONNECT) exigidos pelo Actions on Google.
 *
 * Diferente da Tuya (API server-to-server simples com client_id/secret), o Google exige que
 * O PRÓPRIO USUÁRIO cadastre um projeto no Actions on Google Console e aponte para as rotas
 * deste servidor (authorize/token/fulfillment) — essa parte de configuração externa no Google
 * Cloud não pode ser feita por código, só pelo usuário no painel do Google.
 */

const TOKENS_PATH = path.join(process.cwd(), 'google-home-tokens.json');

interface TokenStore {
  authCodes: Record<string, { createdAt: number; used: boolean }>;
  accessTokens: Record<string, { refreshToken: string; expiresAt: number }>;
  refreshTokens: Record<string, { issuedAt: number }>;
}

function loadTokenStore(): TokenStore {
  try {
    if (fs.existsSync(TOKENS_PATH)) {
      return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Erro ao ler google-home-tokens.json:', e);
  }
  return { authCodes: {}, accessTokens: {}, refreshTokens: {} };
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
  return store;
}

function saveTokenStore(store: TokenStore): void {
  try {
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(pruneTokenStore(store), null, 2), 'utf-8');
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

/**
 * Gera um código de autorização de curta duração (10 min) após o usuário aprovar o vínculo
 * na tela de consentimento local.
 */
export function issueAuthCode(): string {
  const store = loadTokenStore();
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
  saveTokenStore({ authCodes: {}, accessTokens: {}, refreshTokens: {} });
}

// ============================================================================
// Mapeamento de dispositivos Tuya <-> esquema do Google Smart Home
// ============================================================================

function mapTuyaCategoryToGoogleType(category: string): string {
  const cat = (category || '').toLowerCase();
  if (cat === 'dj') return 'action.devices.types.LIGHT';
  if (cat === 'cz' || cat === 'pc') return 'action.devices.types.OUTLET';
  if (cat === 'kg') return 'action.devices.types.SWITCH';
  return 'action.devices.types.SWITCH';
}

/**
 * Descobre o código de liga/desliga real do dispositivo (mesma lógica usada no cliente para
 * o controle Tuya direto), para que EXECUTE funcione em qualquer categoria de dispositivo,
 * não só nos que usam "switch_1".
 */
async function resolveDeviceSwitchCode(deviceId: string): Promise<{ code: string; currentValue: boolean } | null> {
  // Sem try/catch aqui de propósito: engolir o erro fazia o chamador não conseguir distinguir
  // "o aparelho respondeu mas não tem um código de liga/desliga conhecido" de "não foi
  // possível falar com o aparelho" — e ele acabava reportando ao Google que um dispositivo
  // inalcançável estava online e desligado.
  const status = await getDeviceStatus(deviceId);
  const dps: any[] = Array.isArray(status) ? status : [];
  const preferredOrder = ['switch_led', 'switch_1', 'switch', 'switch_one', 'power_switch_1'];
  for (const preferred of preferredOrder) {
    const match = dps.find((d: any) => d.code === preferred);
    if (match) return { code: match.code, currentValue: !!match.value };
  }
  const generic = dps.find((d: any) => /switch/i.test(d.code) && typeof d.value === 'boolean');
  if (generic) return { code: generic.code, currentValue: !!generic.value };
  return null;
}

export async function handleSync(): Promise<any> {
  const devices = await getTuyaDevices();
  const list = Array.isArray(devices) ? devices : [];
  return {
    devices: list.map((d: any) => ({
      id: d.id,
      type: mapTuyaCategoryToGoogleType(d.category),
      traits: ['action.devices.traits.OnOff'],
      name: { name: d.name || d.id },
      willReportState: false,
      deviceInfo: { manufacturer: 'Tuya (via OSONE)', model: d.category || 'unknown' }
    }))
  };
}

export async function handleQuery(deviceIds: string[]): Promise<any> {
  const devices: Record<string, any> = {};
  for (const id of deviceIds) {
    try {
      const resolved = await resolveDeviceSwitchCode(id);
      devices[id] = resolved
        // Respondeu e tem liga/desliga: estado real.
        ? { status: 'SUCCESS', online: true, on: resolved.currentValue }
        // Respondeu, mas não expõe um liga/desliga que saibamos ler: está online, e dizemos
        // que não conseguimos determinar o estado em vez de inventar "desligado".
        : { status: 'ERROR', online: true, errorCode: 'functionNotSupported' };
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

export async function handleExecute(commands: Array<{ devices: Array<{ id: string }>; execution: Array<{ command: string; params?: any }> }>): Promise<any> {
  const commandResults: any[] = [];

  for (const cmd of commands) {
    for (const device of cmd.devices) {
      for (const execution of cmd.execution) {
        try {
          if (execution.command === 'action.devices.commands.OnOff') {
            const resolved = await resolveDeviceSwitchCode(device.id);
            // Sem um liga/desliga conhecido, o comando NÃO é chutado como 'switch_1'.
            //
            // O handleQuery já respondia 'functionNotSupported' nesse caso, e o EXECUTE fazia o
            // oposto: mandava um ponto de dados que o aparelho pode não ter e informava SUCCESS
            // ao Google. O Assistente respondia "ok, liguei", o aparelho não mexia, e a resposta
            // ainda envenenava o estado que o Google guarda. Recusar é o que as duas rotas
            // precisam fazer de forma coerente.
            if (!resolved) {
              commandResults.push({ ids: [device.id], status: 'ERROR', errorCode: 'functionNotSupported' });
              continue;
            }
            const desiredOn = !!execution.params?.on;
            await sendDeviceCommand(device.id, [{ code: resolved.code, value: desiredOn }]);
            commandResults.push({ ids: [device.id], status: 'SUCCESS', states: { online: true, on: desiredOn } });
          } else {
            commandResults.push({ ids: [device.id], status: 'ERROR', errorCode: 'functionNotSupported' });
          }
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
