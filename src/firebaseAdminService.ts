import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;
let db: Firestore | null = null;

const env = (name: string): string => String(process.env[name] || '').trim();

export function firebaseAdminConfigured(): boolean {
  return !!(env('FIREBASE_SERVICE_ACCOUNT_JSON') || env('GOOGLE_APPLICATION_CREDENTIALS'));
}

export function firebaseAdminServices(): { app: App; db: Firestore } {
  if (app && db) return { app, db };

  app = getApps()[0] || null;
  if (!app) {
    const raw = env('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (raw) {
      const serviceAccount = JSON.parse(raw.replace(/^'|'$/g, ''));
      app = initializeApp({ credential: cert(serviceAccount) });
    } else {
      app = initializeApp({
        credential: applicationDefault(),
        projectId: env('FIREBASE_PROJECT_ID') || undefined
      });
    }
  }

  db = getFirestore(app, env('FIREBASE_FIRESTORE_DATABASE_ID') || '(default)');
  return { app, db };
}

export async function verifyFirebaseBearer(header: string): Promise<{ uid: string; email?: string }> {
  if (!header.startsWith('Bearer ')) {
    throw Object.assign(new Error('Entre com sua conta OSONE para ativar o Google Home.'), { status: 401 });
  }
  const { app: adminApp } = firebaseAdminServices();
  try {
    return await getAuth(adminApp).verifyIdToken(header.slice(7));
  } catch (err: any) {
    /**
     * Sem isto, um token expirado (o caso normal depois de ~1h de sessão) chegava aos chamadores
     * como um erro sem `.status` — cloudError, em server.ts, cai para 500 quando `.status` não
     * existe. Todo re-login rotineiro por expiração virava um 500 genérico com stack trace no
     * log do servidor, em vez do 401 que já diz ao cliente "sua sessão caiu, entre de novo".
     */
    throw Object.assign(new Error(err?.message || 'Sessão do Firebase inválida ou expirada.'), { status: 401 });
  }
}
