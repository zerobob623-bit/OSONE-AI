import crypto from 'crypto';

interface TuyaTokenInfo {
  accessToken: string;
  refreshToken: string;
  expireTime: number; // timestamp in ms when token expires
}

let cachedToken: TuyaTokenInfo | null = null;

// Safe helper to get env variables with fallback trimming
function getTuyaEnv() {
  const clientId = (process.env.TUYA_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TUYA_CLIENT_SECRET || '').trim();
  const baseUrl = (process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com').trim().replace(/\/+$/, '');
  const userUid = (process.env.TUYA_USER_UID || '').trim();

  return { clientId, clientSecret, baseUrl, userUid };
}

export function checkTuyaConfig() {
  const env = getTuyaEnv();
  const clientId = !!env.clientId;
  const clientSecret = !!env.clientSecret;
  const baseUrl = !!env.baseUrl;
  const userUid = !!env.userUid;
  const configured = clientId && clientSecret && baseUrl && userUid;

  return {
    configured,
    env: {
      clientId,
      clientSecret,
      baseUrl,
      userUid
    }
  };
}

export function logTuyaStartupCheck() {
  const { configured, env } = checkTuyaConfig();
  if (configured) {
    console.log("⚡ [Tuya Cloud Service] Configuração verificada: todas as variáveis de ambiente ativas (TUYA_CLIENT_ID, TUYA_CLIENT_SECRET, TUYA_BASE_URL, TUYA_USER_UID).");
  } else {
    const missing = [];
    if (!env.clientId) missing.push('TUYA_CLIENT_ID');
    if (!env.clientSecret) missing.push('TUYA_CLIENT_SECRET');
    if (!env.baseUrl) missing.push('TUYA_BASE_URL');
    if (!env.userUid) missing.push('TUYA_USER_UID');
    console.warn(`⚠️ [Tuya Cloud Service] Configuração de variáveis de ambiente incompleta no servidor. Ausentes: ${missing.join(', ')}. Consulte o README.md e preencha no .env.local ou nas variáveis da Vercel.`);
  }
}

/**
 * Calculates SHA256 hex in lowercase
 */
function sha256Hex(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').toLowerCase();
}

/**
 * Calculates HMAC-SHA256 hex in UPPERCASE as mandated by Tuya
 */
function hmacSha256Hex(key: string, data: string): string {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex').toUpperCase();
}

/**
 * Executes an HTTP request to Tuya OpenAPI with HMAC-SHA256 signature and 10s timeout
 */
async function tuyaFetch(
  method: string,
  pathAndQuery: string,
  bodyObj?: any,
  useAccessToken: boolean = true
): Promise<any> {
  const { clientId, clientSecret, baseUrl } = getTuyaEnv();

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais da Tuya Cloud não configuradas no servidor (TUYA_CLIENT_ID ou TUYA_CLIENT_SECRET ausentes).");
  }

  let token = "";
  if (useAccessToken) {
    token = await getValidTuyaToken();
  }

  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const methodUpper = method.toUpperCase();

  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : "";
  const contentHash = sha256Hex(bodyStr);
  const headersStr = ""; // Headers customizados vazios para a Tuya

  // String to sign = METHOD + "\n" + CONTENT_HASH + "\n" + HEADERS + "\n" + PATH_AND_QUERY
  const stringToSign = `${methodUpper}\n${contentHash}\n${headersStr}\n${pathAndQuery}`;

  // Sign string = client_id + access_token (if any) + timestamp + nonce + stringToSign
  const signStr = `${clientId}${token}${timestamp}${nonce}${stringToSign}`;
  const sign = hmacSha256Hex(clientSecret, signStr);

  const headers: Record<string, string> = {
    'client_id': clientId,
    'sign': sign,
    't': timestamp,
    'sign_method': 'HMAC-SHA256',
    'nonce': nonce,
    'Content-Type': 'application/json'
  };

  if (useAccessToken && token) {
    headers['access_token'] = token;
  }

  // AbortController timeout 10 seconds
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const url = `${baseUrl}${pathAndQuery}`;

  try {
    const res = await fetch(url, {
      method: methodUpper,
      headers,
      body: bodyObj ? bodyStr : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Tuya API HTTP Error ${res.status}: ${json?.msg || res.statusText}`);
    }

    if (!json) {
      throw new Error("Resposta inválida ou vazia retornada pela Tuya API.");
    }

    if (json.success === false) {
      const codeMsg = json.code ? ` (código ${json.code})` : "";
      throw new Error(`${json.msg || "Erro retornado pela Tuya Cloud API"}${codeMsg}`);
    }

    return json.result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("Timeout na comunicação com a Tuya Cloud API (resposta excedeu 10 segundos).");
    }
    throw err;
  }
}

/**
 * Retrieves or renews a valid Tuya access_token, auto-refreshing 60s before expiration
 */
async function getValidTuyaToken(): Promise<string> {
  const now = Date.now();
  // Check if cached token is still valid (with 60s safety buffer)
  if (cachedToken && cachedToken.expireTime > now + 60000) {
    return cachedToken.accessToken;
  }

  // Request new token: GET /v1.0/token?grant_type=1
  const pathAndQuery = "/v1.0/token?grant_type=1";
  const result = await tuyaFetch("GET", pathAndQuery, undefined, false);

  if (!result || !result.access_token) {
    throw new Error("A Tuya API não retornou um access_token válido na autenticação.");
  }

  const expiresInSec = result.expire_time || 7200; // default 2 hours
  cachedToken = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token || "",
    expireTime: Date.now() + (expiresInSec * 1000)
  };

  return cachedToken.accessToken;
}

/**
 * List all devices connected to a user UID
 * GET /v1.0/users/{uid}/devices
 */
export async function getTuyaDevices(uid?: string) {
  const { userUid } = getTuyaEnv();
  const targetUid = uid || userUid;

  if (!targetUid) {
    throw new Error("Nenhum UID de usuário Tuya configurado (process.env.TUYA_USER_UID).");
  }

  const path = `/v1.0/users/${targetUid}/devices`;
  return await tuyaFetch("GET", path);
}

/**
 * Get device current status
 * GET /v1.0/devices/{device_id}/status
 */
export async function getDeviceStatus(deviceId: string) {
  if (!deviceId) throw new Error("ID do dispositivo é obrigatório.");
  const path = `/v1.0/devices/${deviceId}/status`;
  return await tuyaFetch("GET", path);
}

/**
 * Get detailed device info (includes name, category, online status, etc.)
 * GET /v1.0/devices/{device_id}
 */
export async function getDeviceDetail(deviceId: string) {
  if (!deviceId) throw new Error("ID do dispositivo é obrigatório.");
  const path = `/v1.0/devices/${deviceId}`;
  return await tuyaFetch("GET", path);
}

/**
 * Send commands to a device
 * POST /v1.0/devices/{device_id}/commands
 */
export async function sendDeviceCommand(deviceId: string, commands: Array<{ code: string; value: any }>) {
  if (!deviceId) throw new Error("ID do dispositivo é obrigatório.");
  if (!commands || !Array.isArray(commands) || commands.length === 0) {
    throw new Error("O parâmetro commands deve ser um array não vazio de comandos.");
  }

  const path = `/v1.0/devices/${deviceId}/commands`;
  return await tuyaFetch("POST", path, { commands });
}
