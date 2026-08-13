import crypto from 'crypto';

export interface TuyaCloudCredentials {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  userUid: string;
}

interface TokenInfo {
  value: string;
  expiresAt: number;
}

const INVALID_TOKEN_CODES = new Set([1004, 1010, 1011, 1012]);

function normalize(credentials: TuyaCloudCredentials): TuyaCloudCredentials {
  const normalized = {
    clientId: String(credentials.clientId || '').trim(),
    clientSecret: String(credentials.clientSecret || '').trim(),
    baseUrl: String(credentials.baseUrl || 'https://openapi.tuyaus.com').trim().replace(/\/+$/, ''),
    userUid: String(credentials.userUid || '').trim()
  };
  if (!normalized.clientId || !normalized.clientSecret || !normalized.baseUrl || !normalized.userUid) {
    throw new Error('As quatro credenciais da Tuya são obrigatórias para a ponte do Google Home.');
  }
  return normalized;
}

export function createTuyaCloudClient(input: TuyaCloudCredentials) {
  const credentials = normalize(input);
  let token: TokenInfo | null = null;
  let tokenInFlight: Promise<string> | null = null;

  const request = async (method: string, pathAndQuery: string, body?: unknown, withToken = true): Promise<any> => {
    const accessToken = withToken ? await getToken() : '';
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const bodyText = body === undefined ? '' : JSON.stringify(body);
    const contentHash = crypto.createHash('sha256').update(bodyText, 'utf8').digest('hex');
    const stringToSign = `${method}\n${contentHash}\n\n${pathAndQuery}`;
    const signText = `${credentials.clientId}${accessToken}${timestamp}${nonce}${stringToSign}`;
    const sign = crypto.createHmac('sha256', credentials.clientSecret).update(signText).digest('hex').toUpperCase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${credentials.baseUrl}${pathAndQuery}`, {
        method,
        headers: {
          client_id: credentials.clientId,
          sign,
          t: timestamp,
          sign_method: 'HMAC-SHA256',
          nonce,
          'Content-Type': 'application/json',
          ...(accessToken ? { access_token: accessToken } : {})
        },
        body: body === undefined ? undefined : bodyText,
        signal: controller.signal
      });
      const json: any = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`Tuya API HTTP ${response.status}: ${json?.msg || response.statusText}`);
      if (!json) throw new Error('A Tuya devolveu uma resposta vazia.');
      if (json.success === false) {
        const error: any = new Error(`${json.msg || 'Erro da Tuya'}${json.code ? ` (código ${json.code})` : ''}`);
        error.tuyaCode = json.code;
        throw error;
      }
      return json.result;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('Timeout na comunicação com a Tuya Cloud API.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const getToken = async (): Promise<string> => {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    if (tokenInFlight) return tokenInFlight;
    tokenInFlight = (async () => {
      const result = await request('GET', '/v1.0/token?grant_type=1', undefined, false);
      if (!result?.access_token) throw new Error('A Tuya não devolveu um token de acesso.');
      token = {
        value: result.access_token,
        expiresAt: Date.now() + Number(result.expire_time || 7200) * 1000
      };
      return token.value;
    })();
    try {
      return await tokenInFlight;
    } finally {
      tokenInFlight = null;
    }
  };

  const authenticated = async (method: string, path: string, body?: unknown): Promise<any> => {
    try {
      return await request(method, path, body);
    } catch (error: any) {
      if (!INVALID_TOKEN_CODES.has(error?.tuyaCode)) throw error;
      token = null;
      return request(method, path, body);
    }
  };

  return {
    getTuyaDevices: () => authenticated('GET', `/v1.0/users/${encodeURIComponent(credentials.userUid)}/devices`),
    getDeviceStatus: (deviceId: string) => authenticated('GET', `/v1.0/devices/${encodeURIComponent(deviceId)}/status`),
    sendDeviceCommand: async (deviceId: string, commands: Array<{ code: string; value: any }>) => {
      const result = await authenticated('POST', `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`, { commands });
      if (result === false) throw new Error('A Tuya recebeu o comando, mas o aparelho o recusou.');
      return result;
    }
  };
}
