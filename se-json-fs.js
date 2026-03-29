// se-json-fs.js — File System Access API: per-game linked .json file handles (persisted via session IDB)

/** @type {Map<string, FileSystemFileHandle>} */
const _linkedJsonByGameId = new Map();

export function hasFileSystemAccess() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/** @param {string|number} gameId */
export function setLinkedJsonFileHandle(gameId, handle) {
  if (gameId == null || !handle) return;
  _linkedJsonByGameId.set(String(gameId), handle);
}

/** @param {string|number} gameId */
export function getLinkedJsonFileHandle(gameId) {
  if (gameId == null) return null;
  return _linkedJsonByGameId.get(String(gameId)) ?? null;
}

/** @param {string|number} gameId */
export function removeLinkedJsonFileHandle(gameId) {
  if (gameId == null) return;
  _linkedJsonByGameId.delete(String(gameId));
}

/** @returns {Array<{ gameId: string, handle: FileSystemFileHandle }>} */
export function collectJsonFileHandlesForSession() {
  return Array.from(_linkedJsonByGameId.entries()).map(([gameId, handle]) => ({ gameId, handle }));
}

/** @param {Array<{ gameId: string, handle: FileSystemFileHandle }>|undefined} entries */
export function restoreJsonFileHandlesFromSession(entries) {
  _linkedJsonByGameId.clear();
  if (!Array.isArray(entries)) return;
  for (const ent of entries) {
    if (ent && ent.gameId != null && ent.handle) {
      _linkedJsonByGameId.set(String(ent.gameId), ent.handle);
    }
  }
}

/**
 * @param {FileSystemFileHandle} fileHandle
 * @param {Blob} blob
 */
export async function writeBlobToFileHandle(fileHandle, blob) {
  if (fileHandle.queryPermission) {
    const perm = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && fileHandle.requestPermission) {
      const req = await fileHandle.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') {
        const err = new Error('permission denied');
        err.code = 'PERMISSION_DENIED';
        throw err;
      }
    }
  }
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}
