// IndexedDB Audio Storage Manager
// Solves localStorage 5MB local limits for larger audio files (e.g. songs up to 5 minutes / ~50MB)

const DB_NAME = "OSONE_AUDIO_STORE";
const STORE_NAME = "audios";
const DB_VERSION = 1;

interface AudioItem {
  id: string;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves a file/blob to the IndexedDB sound storage.
 * @returns Resolves with a virtual custom-protocol URL: "db://[id]"
 */
export async function saveAudio(id: string, blob: Blob, name: string): Promise<string> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const item: AudioItem = {
      id,
      blob,
      name,
      mimeType: blob.type,
      createdAt: Date.now()
    };

    const request = store.put(item);

    request.onsuccess = () => {
      resolve(`db://${id}`);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Resolves any URL or custom internal ID ("db://[id]") to a local playable Object URL or standard URL.
 */
export async function resolveAudioUrl(url: string): Promise<string> {
  if (!url || !url.startsWith("db://")) {
    return url; // It's already a standard HTTP/data URL
  }

  const id = url.replace("db://", "");
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      const item: AudioItem | undefined = request.result;
      if (item && item.blob) {
        // Create an Object URL that the browser can stream immediately
        const objectUrl = URL.createObjectURL(item.blob);
        resolve(objectUrl);
      } else {
        // Fallback or delete reference
        reject(new Error("Audio object not found in local IndexedDB"));
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Deletes an audio entry from IndexedDB on deletion from the library.
 */
export async function deleteAudio(url: string): Promise<void> {
  if (!url || !url.startsWith("db://")) {
    return;
  }

  const id = url.replace("db://", "");
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
