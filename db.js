/* IndexedDB wrapper — Telegram هو المصدر الرئيسي، وهذا مجرد Cache محلي سريع */
const DB_NAME = "quiz_system_db";
const DB_VERSION = 1;
const STORE = "kv";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function emptyAppData() {
  return {
    version: 1,
    updatedAt: 0,
    quizzes: [],
    attempts: [],
    settings: { theme: "dark" },
  };
}

const DataStore = {
  async getData() {
    const d = await idbGet("app_data");
    return d || emptyAppData();
  },
  async setData(data) {
    return idbSet("app_data", data);
  },
  async getMeta() {
    return (await idbGet("meta")) || { lastSync: null, dirty: false };
  },
  async setMeta(meta) {
    return idbSet("meta", meta);
  },
  async getInProgress(attemptId) {
    return idbGet("progress_" + attemptId);
  },
  async setInProgress(attemptId, progress) {
    return idbSet("progress_" + attemptId, progress);
  },
  async clearInProgress(attemptId) {
    return idbDel("progress_" + attemptId);
  },
  async wipeAll() {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },
};
