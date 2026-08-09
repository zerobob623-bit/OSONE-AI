import { RagFile } from '../types';

// Simple IndexedDB helper for robust RAG persistence
export const openRagIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("osone_rag_db", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
  });
};

export const saveRagFileToDB = async (file: RagFile): Promise<void> => {
  try {
    const db = await openRagIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.put(file);
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
  }
};

export const deleteRagFileFromDB = async (id: string): Promise<void> => {
  try {
    const db = await openRagIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.delete(id);
  } catch (err) {
    console.error("IndexedDB Delete Error:", err);
  }
};

export const clearRagDB = async (): Promise<void> => {
  try {
    const db = await openRagIDB();
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    store.clear();
  } catch (err) {
    console.error("IndexedDB Clear Error:", err);
  }
};

export const loadRagFilesFromDB = (): Promise<RagFile[]> => {
  return new Promise((resolve) => {
    openRagIDB().then(db => {
      const transaction = db.transaction("files", "readonly");
      const store = transaction.objectStore("files");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    }).catch(err => {
      console.error("IndexedDB Load Error:", err);
      resolve([]);
    });
  });
};
