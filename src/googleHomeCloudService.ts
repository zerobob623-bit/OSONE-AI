import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { firebaseAdminConfigured, firebaseAdminServices } from './firebaseAdminService';
import { createTuyaCloudClient, type TuyaCloudCredentials } from './tuyaCloudClient';

const USERS = 'googleHomeUsers';
const PAIRINGS = 'googleHomePairingCodes';
const AUTH_CODES = 'googleHomeAuthCodes';
const ACCESS_TOKENS = 'googleHomeAccessTokens';
const REFRESH_TOKENS = 'googleHomeRefreshTokens';

const env = (name: string): string => String(process.env[name] || '').trim();
const digest = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString('base64url');
const now = (): number => Date.now();

export function googleHomeCloudConfiguration() {
  const missing: string[] = [];
  if (!firebaseAdminConfigured()) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!env('GOOGLE_HOME_CLIENT_ID')) missing.push('GOOGLE_HOME_CLIENT_ID');
  if (!env('GOOGLE_HOME_CLIENT_SECRET')) missing.push('GOOGLE_HOME_CLIENT_SECRET');
  if (env('GOOGLE_HOME_ENCRYPTION_KEY').length < 32) missing.push('GOOGLE_HOME_ENCRYPTION_KEY (mínimo 32 caracteres)');
  return { enabled: missing.length === 0, missing };
}

function requireCloud(): void {
  const config = googleHomeCloudConfiguration();
  if (!config.enabled) {
    throw Object.assign(new Error(`Ponte pública do Google Home incompleta: ${config.missing.join(', ')}.`), { status: 503 });
  }
}

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(env('GOOGLE_HOME_ENCRYPTION_KEY')).digest();
}

function encryptCredentials(credentials: TuyaCloudCredentials): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}

function decryptCredentials(vault: string): TuyaCloudCredentials {
  const [ivText, tagText, encryptedText] = String(vault || '').split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Credenciais Tuya armazenadas em formato inválido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plain);
}

function normalizedCredentials(input: Partial<TuyaCloudCredentials>): TuyaCloudCredentials {
  const credentials = {
    clientId: String(input.clientId || '').trim(),
    clientSecret: String(input.clientSecret || '').trim(),
    baseUrl: String(input.baseUrl || 'https://openapi.tuyaus.com').trim().replace(/\/+$/, ''),
    userUid: String(input.userUid || '').trim()
  };
  if (!credentials.clientId || !credentials.clientSecret || !credentials.baseUrl || !credentials.userUid) {
    throw Object.assign(new Error('Preencha e salve as quatro credenciais da Tuya antes de ativar o Google Home.'), { status: 400 });
  }
  if (!/^https:\/\//i.test(credentials.baseUrl)) {
    throw Object.assign(new Error('O endereço da região Tuya precisa começar com https://.'), { status: 400 });
  }
  return credentials;
}

export async function registerGoogleHomeUser(uid: string, input: Partial<TuyaCloudCredentials>) {
  requireCloud();
  const credentials = normalizedCredentials(input);
  let devices: any;
  try {
    devices = await createTuyaCloudClient(credentials).getTuyaDevices();
  } catch (error: any) {
    throw Object.assign(new Error(`A Tuya recusou a ativação pela ponte pública: ${error?.message || error}`), { status: 400 });
  }
  const count = Array.isArray(devices) ? devices.length : 0;
  const { db } = firebaseAdminServices();
  await db.collection(USERS).doc(uid).set({
    tuyaVault: encryptCredentials(credentials),
    tuyaBaseUrl: credentials.baseUrl,
    tuyaUserHint: credentials.userUid.slice(-6),
    deviceCount: count,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { registered: true, deviceCount: count };
}

function pairingCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chars = Array.from(crypto.randomBytes(8), byte => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function normalizePairingCode(code: string): string {
  return String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

export async function issuePairingCode(uid: string) {
  requireCloud();
  const { db } = firebaseAdminServices();
  const user = await db.collection(USERS).doc(uid).get();
  if (!user.exists || !user.data()?.tuyaVault) {
    throw Object.assign(new Error('Envie e valide primeiro as credenciais Tuya desta instalação.'), { status: 409 });
  }
  const code = pairingCode();
  const expiresAt = now() + 10 * 60_000;
  await db.collection(PAIRINGS).doc(digest(normalizePairingCode(code))).set({ uid, expiresAt, createdAt: now() });
  return { code, expiresAt };
}

export async function issueCloudAuthCode(params: {
  pairingCode: string;
  clientId: string;
  redirectUri: string;
}): Promise<string> {
  requireCloud();
  if (params.clientId !== env('GOOGLE_HOME_CLIENT_ID')) {
    throw Object.assign(new Error('Client ID do Google Home inválido.'), { status: 400 });
  }
  const normalized = normalizePairingCode(params.pairingCode);
  if (normalized.length !== 8) throw Object.assign(new Error('Digite o código de 8 caracteres mostrado no OSONE.'), { status: 400 });
  const { db } = firebaseAdminServices();
  const pairingRef = db.collection(PAIRINGS).doc(digest(normalized));
  const uid = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(pairingRef);
    const data = snapshot.data();
    if (!snapshot.exists || !data?.uid || Number(data.expiresAt) <= now()) {
      throw Object.assign(new Error('Código inválido ou vencido. Gere outro no OSONE.'), { status: 400 });
    }
    transaction.delete(pairingRef);
    return String(data.uid);
  });

  const code = randomToken(24);
  await db.collection(AUTH_CODES).doc(digest(code)).set({
    uid,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    expiresAt: now() + 10 * 60_000,
    createdAt: now()
  });
  return code;
}

function validateClient(clientId: string, clientSecret: string): void {
  const expectedId = env('GOOGLE_HOME_CLIENT_ID');
  const expectedSecret = env('GOOGLE_HOME_CLIENT_SECRET');
  const idOk = clientId.length === expectedId.length && crypto.timingSafeEqual(Buffer.from(clientId), Buffer.from(expectedId));
  const secretOk = clientSecret.length === expectedSecret.length && crypto.timingSafeEqual(Buffer.from(clientSecret), Buffer.from(expectedSecret));
  if (!idOk || !secretOk) throw Object.assign(new Error('client_id ou client_secret inválidos.'), { status: 400 });
}

async function saveAccessToken(uid: string, refreshTokenHash: string) {
  const accessToken = randomToken();
  const expiresIn = 3600;
  const { db } = firebaseAdminServices();
  await db.collection(ACCESS_TOKENS).doc(digest(accessToken)).set({
    uid,
    refreshTokenHash,
    expiresAt: now() + expiresIn * 1000,
    createdAt: now()
  });
  return { accessToken, expiresIn };
}

export async function exchangeCloudToken(params: {
  grantType: string;
  code?: string;
  refreshToken?: string;
  redirectUri?: string;
  clientId: string;
  clientSecret: string;
}) {
  requireCloud();
  validateClient(params.clientId, params.clientSecret);
  const { db } = firebaseAdminServices();

  if (params.grantType === 'authorization_code') {
    const ref = db.collection(AUTH_CODES).doc(digest(String(params.code || '')));
    const authData = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!snapshot.exists || !data?.uid || Number(data.expiresAt) <= now() || data.clientId !== params.clientId || data.redirectUri !== params.redirectUri) {
        throw Object.assign(new Error('Código de autorização inválido, vencido ou usado.'), { status: 400 });
      }
      transaction.delete(ref);
      return data;
    });
    const refreshToken = randomToken();
    const refreshHash = digest(refreshToken);
    await db.collection(REFRESH_TOKENS).doc(refreshHash).set({ uid: authData.uid, clientId: params.clientId, createdAt: now() });
    const access = await saveAccessToken(authData.uid, refreshHash);
    return { access_token: access.accessToken, token_type: 'Bearer', expires_in: access.expiresIn, refresh_token: refreshToken };
  }

  if (params.grantType === 'refresh_token') {
    const refreshHash = digest(String(params.refreshToken || ''));
    const snapshot = await db.collection(REFRESH_TOKENS).doc(refreshHash).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data?.uid || data.clientId !== params.clientId) {
      throw Object.assign(new Error('refresh_token inválido.'), { status: 400 });
    }
    const access = await saveAccessToken(String(data.uid), refreshHash);
    return { access_token: access.accessToken, token_type: 'Bearer', expires_in: access.expiresIn };
  }

  throw Object.assign(new Error(`grant_type '${params.grantType}' não suportado.`), { status: 400 });
}

export async function userForAccessToken(accessToken: string): Promise<string | null> {
  requireCloud();
  if (!accessToken) return null;
  const { db } = firebaseAdminServices();
  const snapshot = await db.collection(ACCESS_TOKENS).doc(digest(accessToken)).get();
  const data = snapshot.data();
  if (!snapshot.exists || !data?.uid || Number(data.expiresAt) <= now()) return null;
  return String(data.uid);
}

export async function backendForGoogleHomeUser(uid: string) {
  requireCloud();
  const { db } = firebaseAdminServices();
  const snapshot = await db.collection(USERS).doc(uid).get();
  const vault = snapshot.data()?.tuyaVault;
  if (!snapshot.exists || !vault) throw new Error('A conta OSONE vinculada não possui credenciais Tuya.');
  return createTuyaCloudClient(decryptCredentials(vault));
}

export async function googleHomeCloudStatus(uid: string) {
  requireCloud();
  const { db } = firebaseAdminServices();
  const [user, links] = await Promise.all([
    db.collection(USERS).doc(uid).get(),
    db.collection(REFRESH_TOKENS).where('uid', '==', uid).limit(1).get()
  ]);
  return {
    registered: user.exists && !!user.data()?.tuyaVault,
    linked: !links.empty,
    deviceCount: Number(user.data()?.deviceCount || 0),
    updatedAt: user.data()?.updatedAt || null
  };
}

export async function revokeGoogleHomeUser(uid: string): Promise<void> {
  requireCloud();
  const { db } = firebaseAdminServices();
  const [access, refresh] = await Promise.all([
    db.collection(ACCESS_TOKENS).where('uid', '==', uid).get(),
    db.collection(REFRESH_TOKENS).where('uid', '==', uid).get()
  ]);
  const batch = db.batch();
  access.docs.forEach(doc => batch.delete(doc.ref));
  refresh.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
}
