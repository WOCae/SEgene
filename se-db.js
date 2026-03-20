// se-db.js — IndexedDB wrapper for Game SE Tool
// Stores: session / userPresets / tempBoard

const DB_NAME = 'gameSEToolDB';
const DB_VERSION = 1;

let _db = null;
let _sessionSaver = null;
let _saveTimer = null;

// ---------- Session save scheduling ----------

export function setSessionSaver(fn) {
  _sessionSaver = fn;
}

/** debounce 500ms で session を保存するようスケジュール */
export function scheduleSessionSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    if (_sessionSaver) _sessionSaver();
  }, 500);
}

// ---------- DB open ----------

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('userPresets')) {
        db.createObjectStore('userPresets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('tempBoard')) {
        db.createObjectStore('tempBoard', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror  = (e) => reject(e.target.error);
  });
}

// ---------- Low-level helpers ----------

async function getRecord(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror  = () => reject(req.error);
  });
}

async function putRecord(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
    req.onsuccess = () => resolve();
    req.onerror  = () => reject(req.error);
  });
}

// ---------- Session ----------

/**
 * @param {Object} data  collectSession() が返すオブジェクト
 */
export async function dbSaveSession(data) {
  try {
    await putRecord('session', { id: 'current', ...data });
  } catch (e) {
    console.warn('[se-db] session save failed:', e);
  }
}

/** @returns {Object|null} */
export async function dbRestoreSession() {
  try {
    return await getRecord('session', 'current');
  } catch {
    return null;
  }
}

// ---------- User Presets ----------

/** @returns {Array} */
export async function dbGetUserPresets() {
  try {
    const rec = await getRecord('userPresets', 'list');
    return rec?.data ?? [];
  } catch {
    return [];
  }
}

/** @param {Array} list */
export async function dbSaveUserPresets(list) {
  try {
    await putRecord('userPresets', { id: 'list', data: list });
  } catch (e) {
    console.warn('[se-db] userPresets save failed:', e);
  }
}

// ---------- Temp Board ----------

/** @returns {Array} */
export async function dbGetTempBoard() {
  try {
    const rec = await getRecord('tempBoard', 'cards');
    return rec?.data ?? [];
  } catch {
    return [];
  }
}

/** @param {Array} cards */
export async function dbSaveTempBoard(cards) {
  try {
    await putRecord('tempBoard', { id: 'cards', data: cards });
  } catch (e) {
    console.warn('[se-db] tempBoard save failed:', e);
  }
}

// ---------- localStorage → IDB 初回移行 ----------

/**
 * 旧 localStorage データを IDB へ移行する（初回起動時のみ実行）。
 * 移行後は localStorage のキーを削除する。
 */
export async function migrateFromLocalStorage() {
  const PRESETS_KEY = 'gameSEUserPresets';
  const BOARD_KEY   = 'gameSETempBoard';

  const presetsRaw = localStorage.getItem(PRESETS_KEY);
  if (presetsRaw) {
    try {
      const incoming = JSON.parse(presetsRaw);
      if (Array.isArray(incoming) && incoming.length > 0) {
        const existing = await dbGetUserPresets();
        const merged = [...existing];
        for (const p of incoming) {
          if (!merged.find(e => e.id === p.id)) merged.push(p);
        }
        await dbSaveUserPresets(merged);
      }
    } catch { /* ignore */ }
    localStorage.removeItem(PRESETS_KEY);
  }

  const boardRaw = localStorage.getItem(BOARD_KEY);
  if (boardRaw) {
    try {
      const incoming = JSON.parse(boardRaw);
      if (Array.isArray(incoming) && incoming.length > 0) {
        const existing = await dbGetTempBoard();
        const merged = [...existing];
        for (const c of incoming) {
          if (!merged.find(e => e.id === c.id)) merged.push(c);
        }
        await dbSaveTempBoard(merged);
      }
    } catch { /* ignore */ }
    localStorage.removeItem(BOARD_KEY);
  }
}
