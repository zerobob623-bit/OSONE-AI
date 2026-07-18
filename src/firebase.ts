import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  type User 
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection } from "firebase/firestore";
// Merge settings with explicit environment variables (e.g. on Vercel or GitHub builds)
const mergedConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Firebase is disabled by explicit developer instruction (fully operating in offline/local-profiles mode)
export const isFirebaseFullyConfigured = false;

export let auth: any = { currentUser: null };
export let db: any = {};
export let googleProvider: any = {};

// Fallback wrapping for Firebase methods to avoid crashes
export const customSignInWithPopup = async (authInstance: any, providerInstance: any): Promise<any> => {
  throw new Error("A sincronização em nuvem (Firebase) foi desativada nas configurações por solicitação do usuário. Use os Perfis Locais para criar e alternar contas instantaneamente com segurança!");
};

export const customSignOut = async (authInstance: any) => {
  return;
};

export const customOnAuthStateChanged = (authInstance: any, callback: (user: any) => void) => {
  // Immediately inform that there is no active Firebase user
  callback(null);
  return () => {};
};

export const customDoc = (firestore: any, path: string, ...pathSegments: string[]) => {
  return { id: pathSegments[pathSegments.length - 1] || path } as any;
};

export const customSetDoc = async (docRef: any, data: any, options?: any) => {
  return;
};

export const customGetDoc = async (docRef: any) => {
  return {
    exists: () => false,
    data: () => null
  } as any;
};

export const customUpdateDoc = async (docRef: any, data: any) => {
  return;
};

export const customOnSnapshot = (ref: any, onNext: any, onError?: any) => {
  return () => {};
};

export const customCollection = (firestore: any, path: string, ...pathSegments: string[]) => {
  return {} as any;
};

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
  console.error('Firestore Staged Error bypassed: ', errMessage);
  throw new Error(errMessage);
}

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

export { 
  customSignInWithPopup as signInWithPopup, 
  customSignOut as signOut, 
  customOnAuthStateChanged as onAuthStateChanged, 
  type User,
  customDoc as doc, 
  customSetDoc as setDoc, 
  customGetDoc as getDoc, 
  customUpdateDoc as updateDoc, 
  customOnSnapshot as onSnapshot, 
  customCollection as collection
};

