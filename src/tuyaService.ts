import crypto from 'crypto';

interface TuyaTokenInfo {
  accessToken: string;
  refreshToken: string;
  expireTime: number; // timestamp in ms when token expires
}

let cachedToken: TuyaTokenInfo | null = null;

/**
 * Pedido de token em andamento. Sem isto, várias chamadas simultâneas com o token vencido
 * disparam vários pedidos de token ao mesmo tempo — e a Tuya limita a frequência desse
 * endpoint, fazendo os pedidos extras falharem.
 */
let tokenRequestInFlight: Promise<string> | null = null;

/**
 * Códigos que a Tuya retorna quando o access_token não vale mais (revogado, expirado antes do
 * previsto, ou invalidado porque as credenciais mudaram). Como o token fica em cache por ~2h,
 * sem tratar isso o OSONE continuaria mandando um token morto em toda chamada até o cache
 * vencer sozinho — o aparelho simplesmente não responde e nada explica o porquê.
 */
const TUYA_INVALID_TOKEN_CODES = new Set([1010, 1011, 1012, 1004]);

/** Descarta o token em cache, forçando uma nova autenticação na próxima chamada. */
function invalidateTuyaToken(): void {
  cachedToken = null;
  tokenRequestInFlight = null;
}

/**
 * Um único comando de voz ("ligue a luz") faz de 3 a 4 chamadas SEQUENCIAIS à nuvem da Tuya
 * antes de sequer começar a executar: listar aparelhos (achar o ID pelo nome), ler o status
 * (descobrir quais comandos o aparelho aceita) e, dentro do envio do comando, consultar o
 * detalhe do aparelho de novo (checagem de segurança contra fechaduras) — só então o comando
 * em si. Isso é o principal motivo do Gemini Live demorar para responder a comandos de
 * automação: nenhuma dessas chamadas muda com frequência, mas todas eram refeitas do zero a
 * cada pedido.
 *
 * Os TTLs abaixo são deliberadamente diferentes por chamada, calibrados pelo risco de dado
 * velho: nome/categoria de um aparelho físico praticamente nunca mudam (cache mais longo); o
 * status com os VALORES ao vivo (usado também pelo painel Smart Home e pelo Google Home) fica
 * em cache por só 2s — o bastante para não repetir a mesma leitura dentro de um único turno de
 * voz, sem deixar o painel mostrar um estado visivelmente desatualizado.
 */
const CACHE_LISTA_APARELHOS_MS = 15_000;
const CACHE_DETALHE_APARELHO_MS = 5 * 60_000;
const CACHE_STATUS_APARELHO_MS = 2_000;

let cacheDeAparelhos: { valor: any; expiraEm: number } | null = null;
const cacheDeDetalhes = new Map<string, { valor: any; expiraEm: number }>();
const cacheDeStatus = new Map<string, { valor: any; expiraEm: number }>();

function limparCacheDeStatus(deviceId: string): void {
  cacheDeStatus.delete(deviceId);
}

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

/**
 * Traduz o erro cru da Tuya para uma instrução do que fazer.
 *
 * A Tuya responde com códigos numéricos e frases em inglês técnico ("sign invalid",
 * "no permissions") que não dizem a ninguém qual campo está errado nem onde consertar. Quem está
 * configurando pela primeira vez fica travado sem saber se errou a chave, a região ou a conta —
 * e é justamente na primeira vez que a pessoa mais precisa de direção.
 */
export function explicarErroTuya(mensagem: string): string {
  const m = String(mensagem || '');

  /**
   * CAMPO VAZIO ≠ CAMPO ERRADO, e este teste vem primeiro porque a mensagem de UID ausente
   * contém a palavra "UID" e caía no teste de região lá embaixo. O resultado era mandar
   * conferir o TUYA_BASE_URL de quem simplesmente ainda não tinha preenchido nada — a instrução
   * apontava para o campo errado logo na primeira vez que a pessoa abre o painel.
   */
  if (/não configurad|nenhum uid de usu[áa]rio tuya/i.test(m)) {
    return "As credenciais da Tuya ainda não foram preenchidas neste OSONE. Abra Configurações > Automação > " +
      "Tuya Cloud IoT Platform e preencha o Access ID, o Access Secret, o endereço da região e o UID da sua " +
      "conta. Eles passam a valer na hora, sem reiniciar o app.";
  }
  if (/sign invalid|1004/i.test(m)) {
    return "A Tuya recusou a assinatura da requisição. Quase sempre é o TUYA_CLIENT_SECRET copiado errado " +
      "(faltando um caractere, ou com espaço em volta). Abra o projeto em iot.tuya.com > Cloud > seu projeto > " +
      "aba 'Overview' e copie de novo o Access Secret inteiro.";
  }
  if (/token is expired|1010|1011|1012/i.test(m)) {
    return "O token de acesso da Tuya expirou ou foi invalidado. Normalmente o OSONE renova sozinho — " +
      "se o erro persistir, confira se o Access ID/Secret ainda são os mesmos no painel da Tuya.";
  }
  if (/don't have access to this api|1114/i.test(m)) {
    const ip = m.match(/ip\(([^)]+)\)/i)?.[1];
    return "As credenciais estão CERTAS — a Tuya autenticou e só então bloqueou pelo endereço de IP. " +
      `O projeto tem uma lista de IPs autorizados e ${ip ? `o seu (${ip})` : 'o seu'} não está nela. ` +
      "Em iot.tuya.com > Cloud > seu projeto, procure a lista de IPs (aparece como 'IP Whitelist' ou " +
      `'Allowlist') e acrescente ${ip || 'o IP mostrado no erro'}. ` +
      "Atenção: esse é o IP da sua internet e a maioria das operadoras o troca de tempos em tempos — " +
      "quando parar de funcionar do nada, é provável que ele tenha mudado e precise ser atualizado lá. " +
      "Pelo mesmo motivo, hospedar o OSONE na Vercel não combina com essa trava: o IP de lá muda a cada execução.";
  }
  /**
   * ASSINATURA VENCIDA ≠ FALTA DE AUTORIZAÇÃO. São causas diferentes com soluções diferentes.
   *
   * O código 28841002 estava jogado junto com "no permissions", e a resposta mandava ir na aba
   * 'Service API' autorizar o IoT Core. Só que quem recebe este erro normalmente JÁ tem o IoT Core
   * autorizado — foi verificado em uso real, com os cinco serviços autorizados na tela e o erro
   * acontecendo mesmo assim. A instrução mandava a pessoa conferir de novo o que já estava certo, e
   * o problema real ficava invisível: a Tuya dá o IoT Core como avaliação gratuita por tempo
   * limitado, e quando esse prazo acaba a API para de responder sem que nada tenha sido desfeito.
   *
   * Por isso este teste vem ANTES do de permissão, e fala de renovar, não de autorizar.
   */
  if (/subscription has expired|subscription expired|28841002/i.test(m)) {
    return "A assinatura do serviço IoT Core na Tuya VENCEU. Isto não é falta de autorização: se você olhar a " +
      "aba 'Service API' do projeto, o IoT Core provavelmente continua lá, autorizado — o que acabou foi o " +
      "prazo da avaliação gratuita, e sem ela a Tuya recusa toda chamada da API. " +
      "Para resolver: em platform.tuya.com, com o projeto aberto, vá no menu lateral 'Purchase' (ou 'Cloud > " +
      "Purchase') e procure o IoT Core na lista de serviços/assinaturas. A avaliação gratuita costuma ter um " +
      "botão de renovar/estender por mais um período, sem custo. Renove, espere alguns minutos e clique em " +
      "'Tentar de novo' aqui. " +
      "Enquanto a assinatura estiver vencida, nenhuma credencial vai funcionar — não adianta gerar chave nova " +
      "nem recriar o projeto.";
  }
  if (/no permissions|permission deny|1106/i.test(m)) {
    return "As credenciais são válidas, mas o projeto na Tuya não tem permissão para esta operação. " +
      "Em iot.tuya.com > Cloud > seu projeto > aba 'Service API', clique em 'Go to Authorize' e adicione " +
      "'IoT Core' (e 'Authorization Token Management', se aparecer). Depois espere ~5 minutos e tente de novo.";
  }
  if (/cross-region|not exist|1no such user|user not found|1i0/i.test(m) || /uid/i.test(m)) {
    return "A conta (UID) informada não foi encontrada nesta região. Confira o TUYA_USER_UID e, principalmente, " +
      "se o TUYA_BASE_URL corresponde à região onde sua conta do app Smart Life foi criada — " +
      "no Brasil normalmente é https://openapi.tuyaus.com (data center 'Western America').";
  }
  if (/timeout|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(m)) {
    return "Não foi possível alcançar os servidores da Tuya. Verifique a conexão com a internet e se o " +
      "TUYA_BASE_URL está escrito corretamente.";
  }
  return m;
}

/**
 * Testa a integração Tuya de ponta a ponta e devolve um relatório do que está OK e do que falta.
 *
 * Diferente de checkTuyaConfig, que só verifica se os campos estão PREENCHIDOS, aqui a conexão é
 * de fato exercitada: autentica na Tuya e lista os aparelhos. Um campo preenchido com o valor
 * errado passa na primeira checagem e falha na hora de usar — que é exatamente a situação em que
 * a pessoa acha que configurou tudo certo e nada funciona, sem nenhuma pista do motivo.
 */
export async function diagnosticarTuya(): Promise<any> {
  const env = getTuyaEnv();
  const faltando: string[] = [];
  if (!env.clientId) faltando.push('TUYA_CLIENT_ID');
  if (!env.clientSecret) faltando.push('TUYA_CLIENT_SECRET');
  if (!env.baseUrl) faltando.push('TUYA_BASE_URL');
  if (!env.userUid) faltando.push('TUYA_USER_UID');

  if (faltando.length > 0) {
    return {
      ok: false,
      etapa: 'credenciais',
      resumo: `Faltam ${faltando.length} credencial(is) da Tuya.`,
      faltando,
      comoResolver:
        "Crie um projeto em iot.tuya.com (Cloud > Development > Create Cloud Project), pegue o Access ID e o " +
        "Access Secret na aba 'Overview', vincule o app Smart Life em 'Devices > Link App Account' e copie o UID " +
        "que aparece lá. Preencha esses valores no arquivo .env.local (ou nas variáveis de ambiente da Vercel) e " +
        "reinicie o OSONE.",
      // Só o tamanho, nunca o valor: o diagnóstico é para ser lido e colado num chat de suporte.
      preenchidos: {
        TUYA_CLIENT_ID: env.clientId ? `${env.clientId.length} caracteres` : 'vazio',
        TUYA_CLIENT_SECRET: env.clientSecret ? `${env.clientSecret.length} caracteres` : 'vazio',
        TUYA_BASE_URL: env.baseUrl || 'vazio',
        TUYA_USER_UID: env.userUid ? `${env.userUid.length} caracteres` : 'vazio'
      }
    };
  }

  try {
    const resposta: any = await getTuyaDevices();
    const aparelhos = Array.isArray(resposta) ? resposta : (resposta?.result || resposta?.devices || []);
    const lista = Array.isArray(aparelhos) ? aparelhos : [];

    if (lista.length === 0) {
      return {
        ok: false,
        etapa: 'aparelhos',
        resumo: "Conexão com a Tuya funcionando, mas nenhum aparelho foi encontrado nesta conta.",
        comoResolver:
          "Os aparelhos precisam estar cadastrados no app Smart Life (ou Tuya Smart) da MESMA conta vinculada " +
          "ao projeto. Em iot.tuya.com > Cloud > seu projeto > 'Devices' > 'Link App Account', confirme que a " +
          "conta vinculada é a mesma do celular onde as lâmpadas aparecem.",
        totalAparelhos: 0
      };
    }

    return {
      ok: true,
      etapa: 'pronto',
      resumo: `Tudo certo: ${lista.length} aparelho(s) encontrado(s) e prontos para o OSONE controlar.`,
      totalAparelhos: lista.length,
      aparelhos: lista.slice(0, 20).map((d: any) => ({
        nome: d?.name || '(sem nome)',
        id: d?.id,
        online: d?.online === true,
        tipo: d?.category || d?.product_name || ''
      }))
    };
  } catch (err: any) {
    const bruto = String(err?.message || err);
    return {
      ok: false,
      etapa: 'conexao',
      resumo: "As credenciais estão preenchidas, mas a Tuya recusou a conexão.",
      erroTecnico: bruto,
      comoResolver: explicarErroTuya(bruto)
    };
  }
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
/**
 * Wrapper de tuyaFetch que, se a Tuya recusar o access_token, descarta o token em cache e
 * tenta a chamada UMA vez com um token novo. Sem isso, um token invalidado do lado da Tuya
 * quebrava silenciosamente todos os comandos até o cache expirar (até ~2h): as credenciais
 * estavam certas, o painel dizia conectado, mas nenhum aparelho reagia.
 */
async function tuyaFetchWithTokenRetry(
  method: string,
  pathAndQuery: string,
  bodyObj?: any
): Promise<any> {
  try {
    return await tuyaFetch(method, pathAndQuery, bodyObj, true);
  } catch (err: any) {
    if (!TUYA_INVALID_TOKEN_CODES.has(err?.tuyaCode)) throw err;
    console.warn(`[Tuya] Token recusado pela Tuya (código ${err.tuyaCode}). Reautenticando e tentando novamente...`);
    invalidateTuyaToken();
    return await tuyaFetch(method, pathAndQuery, bodyObj, true);
  }
}

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
      const err: any = new Error(`${json.msg || "Erro retornado pela Tuya Cloud API"}${codeMsg}`);
      err.tuyaCode = json.code;
      throw err;
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

  // Se já existe um pedido de token em andamento, todos aguardam o mesmo, em vez de cada
  // chamada abrir o seu (a Tuya limita a frequência do endpoint de token).
  if (tokenRequestInFlight) {
    return tokenRequestInFlight;
  }

  tokenRequestInFlight = (async () => {
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
  })();

  try {
    return await tokenRequestInFlight;
  } finally {
    // Libera o slot para que uma falha não deixe todas as chamadas seguintes presas a uma
    // promise já rejeitada.
    tokenRequestInFlight = null;
  }
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

  if (cacheDeAparelhos && cacheDeAparelhos.expiraEm > Date.now()) {
    return cacheDeAparelhos.valor;
  }

  const path = `/v1.0/users/${targetUid}/devices`;
  const resultado = await tuyaFetchWithTokenRetry("GET", path);
  cacheDeAparelhos = { valor: resultado, expiraEm: Date.now() + CACHE_LISTA_APARELHOS_MS };
  return resultado;
}

/**
 * Get device current status
 * GET /v1.0/devices/{device_id}/status
 */
export async function getDeviceStatus(deviceId: string) {
  if (!deviceId) throw new Error("ID do dispositivo é obrigatório.");

  const emCache = cacheDeStatus.get(deviceId);
  if (emCache && emCache.expiraEm > Date.now()) return emCache.valor;

  const path = `/v1.0/devices/${deviceId}/status`;
  const resultado = await tuyaFetchWithTokenRetry("GET", path);
  cacheDeStatus.set(deviceId, { valor: resultado, expiraEm: Date.now() + CACHE_STATUS_APARELHO_MS });
  return resultado;
}

/**
 * Get detailed device info (includes name, category, online status, etc.)
 * GET /v1.0/devices/{device_id}
 */
export async function getDeviceDetail(deviceId: string) {
  if (!deviceId) throw new Error("ID do dispositivo é obrigatório.");

  const emCache = cacheDeDetalhes.get(deviceId);
  if (emCache && emCache.expiraEm > Date.now()) return emCache.valor;

  const path = `/v1.0/devices/${deviceId}`;
  const resultado = await tuyaFetchWithTokenRetry("GET", path);
  cacheDeDetalhes.set(deviceId, { valor: resultado, expiraEm: Date.now() + CACHE_DETALHE_APARELHO_MS });
  return resultado;
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
  const result = await tuyaFetchWithTokenRetry("POST", path, { commands });

  // A Tuya pode aceitar a requisição (success: true) e ainda assim REJEITAR o comando,
  // devolvendo result: false — tipicamente quando o aparelho está offline ou o código do
  // comando não existe naquele modelo. Sem checar isso, o OSONE anunciava que ligou a luz
  // enquanto nada acontecia de fato.
  if (result === false) {
    throw new Error(
      `A Tuya recebeu o comando mas o dispositivo o recusou (provavelmente está offline ou não aceita '${commands.map(c => c.code).join(", ")}'). Nada foi alterado.`
    );
  }

  // O comando muda o estado real do aparelho — manter o status antigo em cache faria uma
  // leitura logo em seguida (nesta mesma conversa) devolver o valor de ANTES do comando.
  limparCacheDeStatus(deviceId);

  return result;
}
