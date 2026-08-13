import { build } from 'esbuild';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'osone-google-cloud-'));
const bundle = path.join(temp, 'service.mjs');
const collections = new Map();
let lastTuyaCredentials = null;

const collectionData = name => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
};

const snapshot = (id, value, ref) => ({ id, ref, exists: value !== undefined, data: () => value });
const document = (collection, id) => {
  const ref = {
    id,
    _collection: collection,
    async get() { return snapshot(id, collectionData(collection).get(id), ref); },
    async set(value, options) {
      const current = collectionData(collection).get(id) || {};
      collectionData(collection).set(id, options?.merge ? { ...current, ...value } : value);
    }
  };
  return ref;
};

const query = (collection, field, expected, max = Infinity) => ({
  limit(value) { return query(collection, field, expected, value); },
  async get() {
    const docs = [...collectionData(collection).entries()]
      .filter(([, value]) => value?.[field] === expected)
      .slice(0, max)
      .map(([id, value]) => snapshot(id, value, document(collection, id)));
    return { docs, empty: docs.length === 0 };
  }
});

const fakeDb = {
  collection(name) {
    return {
      doc: id => document(name, id),
      where: (field, operator, expected) => {
        if (operator !== '==') throw new Error('Operador inesperado no teste');
        return query(name, field, expected);
      }
    };
  },
  async runTransaction(callback) {
    return callback({
      get: ref => ref.get(),
      delete: ref => collectionData(ref._collection).delete(ref.id)
    });
  },
  batch() {
    const deletions = [];
    return {
      delete(ref) { deletions.push(ref); },
      async commit() { deletions.forEach(ref => collectionData(ref._collection).delete(ref.id)); }
    };
  }
};

await build({
  entryPoints: [path.join(root, 'src/googleHomeCloudService.ts')],
  outfile: bundle,
  bundle: true,
  format: 'esm',
  platform: 'node',
  packages: 'external',
  logLevel: 'silent',
  plugins: [{
    name: 'cloud-dependencies',
    setup(builder) {
      builder.onResolve({ filter: /^firebase-admin\/firestore$/ }, () => ({ path: 'firestore-fields-mock', namespace: 'test' }));
      builder.onResolve({ filter: /firebaseAdminService$/ }, () => ({ path: 'firebase-admin-mock', namespace: 'test' }));
      builder.onResolve({ filter: /tuyaCloudClient$/ }, () => ({ path: 'tuya-mock', namespace: 'test' }));
      builder.onLoad({ filter: /firebase-admin-mock/, namespace: 'test' }, () => ({
        loader: 'js',
        contents: `
          export const firebaseAdminConfigured = () => true;
          export const firebaseAdminServices = () => ({ db: globalThis.__fakeDb });
        `
      }));
      builder.onLoad({ filter: /firestore-fields-mock/, namespace: 'test' }, () => ({
        loader: 'js',
        contents: `export const FieldValue = { serverTimestamp: () => ({ __serverTimestamp: true }) };`
      }));
      builder.onLoad({ filter: /tuya-mock/, namespace: 'test' }, () => ({
        loader: 'js',
        contents: `
          export const createTuyaCloudClient = credentials => {
            globalThis.__lastTuyaCredentials = credentials;
            return {
              getTuyaDevices: async () => [{ id: 'lampada' }, { id: 'tomada' }],
              getDeviceStatus: async id => [{ code: 'switch_1', value: id === 'lampada' }],
              sendDeviceCommand: async () => true
            };
          };
        `
      }));
    }
  }]
});

globalThis.__fakeDb = fakeDb;
Object.defineProperty(globalThis, '__lastTuyaCredentials', {
  get: () => lastTuyaCredentials,
  set: value => { lastTuyaCredentials = value; }
});
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"configured":true}';
process.env.GOOGLE_HOME_CLIENT_ID = 'osone-google-client';
process.env.GOOGLE_HOME_CLIENT_SECRET = 'segredo-google-home';
process.env.GOOGLE_HOME_ENCRYPTION_KEY = 'chave-de-teste-com-mais-de-trinta-e-dois-caracteres';

const service = await import(`file://${bundle}`);
let passed = 0;
const check = (condition, message) => {
  if (!condition) throw new Error(message);
  passed++;
  console.log(`  ok    ${message}`);
};

const credentials = {
  clientId: 'tuya-id',
  clientSecret: 'tuya-secret-que-nao-pode-ficar-aberto',
  baseUrl: 'https://openapi.tuyaus.com',
  userUid: 'uid-tuya-123456'
};

const registration = await service.registerGoogleHomeUser('firebase-user-a', credentials);
check(registration.deviceCount === 2, 'registro valida a Tuya antes de preparar o vínculo');
const storedUser = collectionData('googleHomeUsers').get('firebase-user-a');
check(!JSON.stringify(storedUser).includes(credentials.clientSecret) && String(storedUser.tuyaVault).split('.').length === 3,
  'segredo Tuya fica cifrado no Firestore');

const pairing = await service.issuePairingCode('firebase-user-a');
check(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(pairing.code), 'instalável recebe código curto e legível');
const redirectUri = 'https://oauth-redirect.googleusercontent.com/r/osone-home';
const authCode = await service.issueCloudAuthCode({ pairingCode: pairing.code, clientId: process.env.GOOGLE_HOME_CLIENT_ID, redirectUri });
check(typeof authCode === 'string' && authCode.length > 20, 'código de pareamento emite autorização OAuth');

let reused = false;
try {
  await service.issueCloudAuthCode({ pairingCode: pairing.code, clientId: process.env.GOOGLE_HOME_CLIENT_ID, redirectUri });
} catch {
  reused = true;
}
check(reused, 'código de pareamento é descartado depois do primeiro uso');

const tokens = await service.exchangeCloudToken({
  grantType: 'authorization_code', code: authCode, redirectUri,
  clientId: process.env.GOOGLE_HOME_CLIENT_ID, clientSecret: process.env.GOOGLE_HOME_CLIENT_SECRET
});
check(await service.userForAccessToken(tokens.access_token) === 'firebase-user-a', 'access token aponta para a conta Firebase correta');

await service.backendForGoogleHomeUser('firebase-user-a');
check(lastTuyaCredentials.clientSecret === credentials.clientSecret, 'backend decifra as credenciais somente ao chamar a Tuya');

const refreshed = await service.exchangeCloudToken({
  grantType: 'refresh_token', refreshToken: tokens.refresh_token,
  clientId: process.env.GOOGLE_HOME_CLIENT_ID, clientSecret: process.env.GOOGLE_HOME_CLIENT_SECRET
});
check(await service.userForAccessToken(refreshed.access_token) === 'firebase-user-a', 'refresh token renova a sessão do mesmo usuário');

await service.revokeGoogleHomeUser('firebase-user-a');
check(await service.userForAccessToken(refreshed.access_token) === null, 'desvincular invalida os tokens persistentes');

console.log(`\n${passed}/${passed} conferências da ponte em nuvem passaram.`);
