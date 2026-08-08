import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup as fbSignInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  type Auth,
  type User
} from "firebase/auth";
import {
  getFirestore,
  doc as fbDoc,
  setDoc as fbSetDoc,
  getDoc as fbGetDoc,
  updateDoc as fbUpdateDoc,
  onSnapshot as fbOnSnapshot,
  collection as fbCollection,
  serverTimestamp as fbServerTimestamp,
  type Firestore
} from "firebase/firestore";

/**
 * Lê uma variável de ambiente já sem espaços ou quebras de linha em volta.
 *
 * O trim() não é zelo excessivo: copiar uma chave do console do Google costuma trazer junto uma
 * quebra de linha invisível, e ao colá-la num secret do GitHub ela é guardada exatamente assim.
 * O valor viaja embutido no app e chega ao Firebase com um "\n" no fim — que aparece como %0A na
 * URL de login e faz o Google recusar com "The requested action is invalid", sem dizer o motivo.
 * Na tela a chave parece perfeita, então o defeito é praticamente invisível.
 */
const env = (nome: string): string => String(import.meta.env[nome] ?? "").trim();

// Merge settings with explicit environment variables (e.g. on Vercel or GitHub builds)
const firebaseConfig = {
  apiKey: env("VITE_FIREBASE_API_KEY"),
  authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: env("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: env("VITE_FIREBASE_APP_ID"),
  measurementId: env("VITE_FIREBASE_MEASUREMENT_ID"),
};

/**
 * true somente quando as três chaves indispensáveis (apiKey, projectId, appId) estão
 * presentes. Sem isso, tentar inicializar o Firebase quebraria o app inteiro para qualquer
 * pessoa que rode o OSONE sem ter configurado um projeto Firebase próprio — nesse caso, o
 * app continua funcionando 100% com Perfis Locais (localStorage), só sem sincronização em
 * nuvem, em vez de travar.
 */
export const isFirebaseFullyConfigured = !!(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

/**
 * Quais variáveis faltam para o login com Google funcionar, pelo nome exato.
 *
 * authDomain entra aqui mesmo não entrando em isFirebaseFullyConfigured: sem ele o app se
 * considera configurado e o login morre depois, na abertura da janela, com um código que não diz
 * o que fazer. Nomear a variável que falta é a diferença entre "deu erro" e "preencha isto".
 */
export const firebaseConfigFaltando: string[] = ([
  ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey],
  ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['VITE_FIREBASE_APP_ID', firebaseConfig.appId]
] as [string, string][]).filter(([, valor]) => !valor).map(([nome]) => nome);

/**
 * Traduz a falha do login para o que precisa ser feito a respeito.
 *
 * O código do Firebase ('auth/unauthorized-domain') e a mensagem crua não dizem onde clicar nem o
 * que preencher, e era isso que chegava ao usuário. Cada caso aqui aponta a tela e o valor exato —
 * inclusive o endereço em que o app está rodando, que no app instalado não é o do site e é
 * justamente o que costuma faltar na lista de domínios autorizados.
 *
 * Devolve string vazia quando não houve falha nenhuma a relatar (o usuário só fechou a janela).
 */
export function explicarErroDeLogin(err: any): string {
  const codigo = String(err?.code || '');
  const endereco = typeof window !== 'undefined' ? window.location.origin : '';
  const dominio = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (codigo) {
    case 'auth/unauthorized-domain':
      return `O Firebase recusou o endereço em que o OSONE está aberto (${endereco}). ` +
        `Abra o Console do Firebase > Authentication > Settings > Authorized domains e acrescente "${dominio}". ` +
        `No app instalado o endereço é ${dominio}, e não o do site — por isso o login pode funcionar no navegador e falhar aqui.`;
    case 'auth/operation-not-allowed':
      return 'O login com Google está desligado no projeto Firebase. Ligue em Console do Firebase > Authentication > Sign-in method > Google.';
    case 'auth/configuration-not-found':
      return 'Este projeto Firebase não tem o Authentication ativado. Abra o Console do Firebase > Authentication e conclua a ativação.';
    case 'auth/auth-domain-config-required':
      return 'Falta a variável VITE_FIREBASE_AUTH_DOMAIN nesta instalação. Sem ela o Firebase não sabe para onde abrir a janela de login.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'A chave VITE_FIREBASE_API_KEY não é aceita por este projeto. Copie de novo do Console do Firebase > Configurações do projeto > Seus apps.';
    case 'auth/popup-blocked':
      return 'A janela de login foi bloqueada antes de abrir. Libere pop-ups para este endereço e tente de novo.';
    case 'auth/network-request-failed':
      return 'A rede não respondeu ao falar com o Google. Confira a internet e se o firewall ou o antivírus está bloqueando o OSONE.';
    case 'auth/too-many-requests':
      return 'O Google bloqueou temporariamente as tentativas deste computador. Espere alguns minutos e tente de novo.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      // Vazio de propósito: quem chama põe no lugar um texto que também serve para o caso em que
      // a janela foi recusada pelo Google, porque o Firebase usa este mesmo código para os dois.
      return '';
    case 'auth/internal-error':
      return 'O Firebase respondeu com erro interno. Costuma ser chave incompleta ou domínio não autorizado — confira ' +
        `se "${dominio}" está em Authentication > Settings > Authorized domains.`;
    default:
      return `${err?.message || err}${codigo ? ` (código: ${codigo})` : ''}`;
  }
}

let app: FirebaseApp | null = null;
let realAuth: Auth | null = null;
let realDb: Firestore | null = null;

if (isFirebaseFullyConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    realAuth = getAuth(app);
    // A maioria dos projetos Firebase usa o banco Firestore "(default)", mas quem criou um
    // banco nomeado (ex: multi-região) precisa apontar para ele explicitamente — senão as
    // leituras/escritas iriam silenciosamente para o banco padrão errado.
    const namedDatabaseId = (import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || "").trim();
    realDb = namedDatabaseId ? getFirestore(app, namedDatabaseId) : getFirestore(app);
  } catch (e) {
    console.error("[Firebase] Falha ao inicializar com as credenciais fornecidas:", e);
  }
}

export const auth: any = realAuth || { currentUser: null };
export const db: any = realDb || {};
// GoogleAuthProvider não depende de app inicializado, então pode sempre existir de verdade —
// só o USO dele (signInWithPopup) é que exige Firebase configurado.
export const googleProvider = new GoogleAuthProvider();

const NOT_CONFIGURED_MSG =
  "A sincronização em nuvem (Firebase) não está configurada nesta instalação do OSONE. " +
  "Preencha as variáveis VITE_FIREBASE_* (veja .env.example) com as credenciais do seu " +
  "projeto Firebase, ou continue usando um Perfil Local — ele funciona 100% sem nuvem.";

export const signInWithPopup = async (authInstance: any, providerInstance: any): Promise<any> => {
  if (!realAuth) throw new Error(NOT_CONFIGURED_MSG);
  return fbSignInWithPopup(authInstance, providerInstance);
};

export const signOut = async (authInstance: any) => {
  if (!realAuth) return;
  return fbSignOut(authInstance);
};

export const onAuthStateChanged = (authInstance: any, callback: (user: any) => void) => {
  if (!realAuth) {
    // Sem Firebase configurado, nunca há usuário autenticado por nuvem — informa isso uma
    // vez e nunca mais chama o callback (não há nada a observar), evitando esperar por um
    // evento que nunca vai acontecer.
    callback(null);
    return () => {};
  }
  return fbOnAuthStateChanged(authInstance, callback);
};

export const doc = (firestore: any, path: string, ...pathSegments: string[]) => {
  if (!realDb) return { id: pathSegments[pathSegments.length - 1] || path } as any;
  return fbDoc(firestore, path, ...pathSegments);
};

export const setDoc = async (docRef: any, data: any, options?: any) => {
  if (!realDb) throw new Error(NOT_CONFIGURED_MSG);
  return fbSetDoc(docRef, data, options);
};

export const getDoc = async (docRef: any) => {
  if (!realDb) {
    return { exists: () => false, data: () => null } as any;
  }
  return fbGetDoc(docRef);
};

export const updateDoc = async (docRef: any, data: any) => {
  if (!realDb) throw new Error(NOT_CONFIGURED_MSG);
  return fbUpdateDoc(docRef, data);
};

export const onSnapshot = (ref: any, onNext: any, onError?: any) => {
  if (!realDb) return () => {};
  return fbOnSnapshot(ref, onNext, onError);
};

export const collection = (firestore: any, path: string, ...pathSegments: string[]) => {
  if (!realDb) return {} as any;
  return fbCollection(firestore, path, ...pathSegments);
};

export const serverTimestamp = () => fbServerTimestamp();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  console.error(`[Firestore] Erro em ${operationType} (${path}):`, errMessage);
  throw new Error(errMessage);
}

/**
 * Classe leve e independente do SDK, usada pelos hooks de memória local (useUserMemory) que
 * não tocam o Firestore diretamente — só precisam de um objeto com a mesma forma de um
 * Timestamp (seconds/nanoseconds/toDate/toISOString) para serializar datas de forma
 * consistente no localStorage.
 */
export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }
  toISOString() {
    return this.toDate().toISOString();
  }
}

export type { User };
