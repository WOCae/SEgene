// se-db.js — IndexedDB wrapper for Game SE Tool
// Stores: session / userGames (game->subtab->items) / tempBoard

const DB_NAME = 'gameSEToolDB';
// DBは機能拡張に伴いフォーマットが変わるため、バージョンを上げるたびに
// 既存ObjectStoreを全作り直して「旧形式データ」を残さない方針にする。
const DB_VERSION = 3;

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
      // B: 全消去（旧型式データを保持しない）
      // onupgradeneeded内で全ObjectStoreを削除してから再作成する。
      for (const name of Array.from(db.objectStoreNames)) {
        db.deleteObjectStore(name);
      }

      db.createObjectStore('session', { keyPath: 'id' });
      // userGames: { id, name, createdAt, updatedAt, subtabs: [{ id, name, createdAt, updatedAt, items: [{ id, name, params }] }] }
      db.createObjectStore('userGames', { keyPath: 'id' });
      db.createObjectStore('tempBoard', { keyPath: 'id' });
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

// ---------- User Library (games -> subtabs -> items) ----------
// 内部データ構造:
// userGames: [{ id, name, createdAt, updatedAt, subtabs: [{ id, name, createdAt, updatedAt, items: [{ id, name, params, createdAt, updatedAt }] }] }]

function _now() { return Date.now(); }
function _sid(id) { return String(id); }

async function _getUserGameByKey(gameId) {
  // IndexedDB keyPath is type-sensitive; try string and number.
  try {
    const rec1 = await getRecord('userGames', gameId);
    if (rec1) return rec1;
  } catch { /* ignore */ }

  if (typeof gameId === 'string') {
    const n = Number(gameId);
    if (Number.isFinite(n)) {
      try {
        const rec2 = await getRecord('userGames', n);
        if (rec2) return rec2;
      } catch { /* ignore */ }
    }
  }
  return null;
}

/** @returns {Promise<Array>} */
export async function dbGetUserGames() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const items = [];
      const tx = db.transaction('userGames', 'readonly');
      const store = tx.objectStore('userGames');
      const req = store.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(items); return; }
        items.push(cur.value);
        cur.continue();
      };
    });
  } catch {
    return [];
  }
}

/** @param {string} gameId */
export async function dbGetUserGame(gameId) {
  try {
    // Robust lookup: compare by String() over cursor results.
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('userGames', 'readonly');
      const store = tx.objectStore('userGames');
      const sid = String(gameId);
      const req = store.openCursor();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(null); return; }
        const v = cur.value;
        if (v && String(v.id) === sid) { resolve(v); return; }
        cur.continue();
      };
    });
  } catch {
    return null;
  }
}

/** @param {Object} game */
export async function dbSaveUserGame(game) {
  try {
    await putRecord('userGames', game);
  } catch (e) {
    console.warn('[se-db] userGames save failed:', e);
  }
}

/** @param {string} gameId */
export async function dbDeleteUserGame(gameId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('userGames', 'readwrite');
    const store = tx.objectStore('userGames');
    const sid = String(gameId);
    let done = false;

    const req = store.openCursor();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { if (!done) resolve(); return; }
      const v = cur.value;
      if (v && String(v.id) === sid) {
        done = true;
        // Use the cursor key (actual stored key type) for deletion.
        const delReq = store.delete(cur.key);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve(); // best effort
        return;
      }
      cur.continue();
    };
  });
}

export async function dbCreateUserGame(name) {
  const games = await dbGetUserGames();
  const maxOrder = games.reduce((m, g) => {
    const o = g?.order;
    const n = typeof o === 'number' ? o : Number(o);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, -1);

  const game = {
    id: _now() + Math.random(),
    name,
    createdAt: new Date().toLocaleString('en-US'),
    updatedAt: new Date().toLocaleString('en-US'),
    order: maxOrder + 1,
    subtabs: []
  };
  await dbSaveUserGame(game);
  return game;
}

export async function dbRenameUserGame(gameId, newName) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;
  game.name = newName;
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return game;
}

export async function dbDeleteUserSubTab(gameId, subTabId) {
  const game = await dbGetUserGame(gameId);
  if (!game) return;
  const sid = _sid(subTabId);
  game.subtabs = (game.subtabs || []).filter(st => _sid(st.id) !== sid);
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
}

export async function dbCopyUserSubTab(gameId, subTabId) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;
  const sid = _sid(subTabId);
  const st = (game.subtabs || []).find(x => _sid(x.id) === sid);
  if (!st) return null;

  // Deep copy + new ids for subtab/items
  const newSubTabId = _now() + Math.random();
  const copied = {
    id: newSubTabId,
    name: st.name,
    createdAt: new Date().toLocaleString('en-US'),
    updatedAt: new Date().toLocaleString('en-US'),
    items: (st.items || []).map(it => ({
      id: _now() + Math.random(),
      name: it.name,
      params: it.params,
      createdAt: new Date().toLocaleString('en-US'),
      updatedAt: new Date().toLocaleString('en-US'),
    }))
  };

  game.subtabs = [...(game.subtabs || []), copied];
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return copied;
}

export async function dbCreateUserSubTab(gameId, name, items = []) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;

  const subtabs = game.subtabs || [];
  const maxOrder = subtabs.reduce((m, st) => {
    const o = st?.order;
    const n = typeof o === 'number' ? o : Number(o);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, -1);

  const sub = {
    id: _now() + Math.random(),
    name,
    createdAt: new Date().toLocaleString('en-US'),
    updatedAt: new Date().toLocaleString('en-US'),
    order: maxOrder + 1,
    items: items.map(it => ({
      id: it.id ?? (_now() + Math.random()),
      name: it.name ?? 'SE',
      params: it.params ?? {},
      createdAt: it.createdAt ?? new Date().toLocaleString('en-US'),
      updatedAt: it.updatedAt ?? new Date().toLocaleString('en-US'),
    }))
  };
  game.subtabs = [...(game.subtabs || []), sub];
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return sub;
}

/**
 * ユーザーゲーム順序を更新（Drag&Drop 用）
 * @param {Array<string|number>} gameIdsOrdered 新しい並び順（全件含める想定）
 */
export async function dbReorderUserGames(gameIdsOrdered) {
  const games = await dbGetUserGames();
  const map = new Map((gameIdsOrdered || []).map((id, idx) => [_sid(id), idx]));

  let changed = false;
  games.forEach(g => {
    const idx = map.get(_sid(g.id));
    if (idx == null) return;
    const want = idx;
    if (g.order !== want) {
      g.order = want;
      changed = true;
    }
  });

  if (!changed) return;
  await Promise.all(games.map(g => dbSaveUserGame(g)));
}

/**
 * 指定ゲーム配下のサブタブ順序を更新（Drag&Drop 用）
 * @param {string|number} gameId
 * @param {Array<string|number>} subTabIdsOrdered 新しい並び順（全件含める想定）
 */
export async function dbReorderUserSubTabs(gameId, subTabIdsOrdered) {
  const game = await dbGetUserGame(gameId);
  if (!game) return;

  const map = new Map((subTabIdsOrdered || []).map((id, idx) => [_sid(id), idx]));
  const subtabs = game.subtabs || [];

  let changed = false;
  subtabs.forEach(st => {
    const idx = map.get(_sid(st.id));
    if (idx == null) return;
    if (st.order !== idx) {
      st.order = idx;
      changed = true;
    }
  });

  if (!changed) return;
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
}

export async function dbRenameUserSubTab(gameId, subTabId, newName) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;
  const sid = _sid(subTabId);
  const st = (game.subtabs || []).find(x => _sid(x.id) === sid);
  if (!st) return null;
  st.name = newName;
  st.updatedAt = new Date().toLocaleString('en-US');
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return st;
}

export async function dbCopyUserGame(gameId) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;

  const newGameId = _now() + Math.random();
  const copied = {
    ...game,
    id: newGameId,
    name: game.name,
    createdAt: new Date().toLocaleString('en-US'),
    updatedAt: new Date().toLocaleString('en-US'),
    subtabs: (game.subtabs || []).map(st => ({
      id: _now() + Math.random(),
      name: st.name,
      createdAt: new Date().toLocaleString('en-US'),
      updatedAt: new Date().toLocaleString('en-US'),
      items: (st.items || []).map(it => ({
        id: _now() + Math.random(),
        name: it.name,
        params: it.params,
        createdAt: new Date().toLocaleString('en-US'),
        updatedAt: new Date().toLocaleString('en-US'),
      }))
    }))
  };

  await dbSaveUserGame(copied);
  return copied;
}

// Items
export async function dbAddItemToSubTab(gameId, subTabId, item) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;
  const sid = _sid(subTabId);
  const st = (game.subtabs || []).find(x => _sid(x.id) === sid);
  if (!st) return null;
  const newItem = {
    id: item.id ?? (_now() + Math.random()),
    name: item.name ?? 'SE',
    params: item.params ?? {},
    createdAt: new Date().toLocaleString('en-US'),
    updatedAt: new Date().toLocaleString('en-US'),
  };
  st.items = [...(st.items || []), newItem];
  st.updatedAt = new Date().toLocaleString('en-US');
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return newItem;
}

export async function dbDeleteItemFromSubTab(gameId, subTabId, itemId) {
  const game = await dbGetUserGame(gameId);
  if (!game) return;
  const sid = _sid(subTabId);
  const st = (game.subtabs || []).find(x => _sid(x.id) === sid);
  if (!st) return;
  const iid = _sid(itemId);
  st.items = (st.items || []).filter(it => _sid(it.id) !== iid);
  st.updatedAt = new Date().toLocaleString('en-US');
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
}

export async function dbRenameItemInSubTab(gameId, subTabId, itemId, newName) {
  const game = await dbGetUserGame(gameId);
  if (!game) return null;
  const sid = _sid(subTabId);
  const st = (game.subtabs || []).find(x => _sid(x.id) === sid);
  if (!st) return null;
  const iid = _sid(itemId);
  const it = (st.items || []).find(x => _sid(x.id) === iid);
  if (!it) return null;
  it.name = newName;
  it.updatedAt = new Date().toLocaleString('en-US');
  st.updatedAt = new Date().toLocaleString('en-US');
  game.updatedAt = new Date().toLocaleString('en-US');
  await dbSaveUserGame(game);
  return it;
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
  // B: 旧形式の再投入を防ぐため、localStorage に残っていた旧プリセット/Boardも削除のみ行う。
  // （必要なら後で新形式のimportをUI側で提供する）
  const PRESETS_KEY = 'gameSEUserPresets';
  const BOARD_KEY   = 'gameSETempBoard';
  localStorage.removeItem(PRESETS_KEY);
  localStorage.removeItem(BOARD_KEY);
}
