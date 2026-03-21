import {
  state, app,
  serializePresetForLibrary, normalizePresetParamsForStorage, applyPresetParamsFromLibrary
} from './se-state.js';
import { showToast } from './se-toast.js';
import { renderPresets, applyStateToUI } from './se-editor-ui.js';
import {
  dbGetUserGame,
  dbCreateUserGame,
  dbCreateUserSubTab,
  dbAddItemToSubTab,
  dbDeleteItemFromSubTab,
  dbRenameItemInSubTab
} from './se-db.js';
import { t } from './se-i18n.js';
import { renderParamsToWAV, renderParamsToMP3, renderParamsToOGG } from './se-audio-engine.js';
import { refreshLibraryTabs } from './se-library-ui.js';
import { debugLibrary } from './se-debug.js';

function _getModalSelection() {
  const selGame = document.getElementById('libraryGameSelect');
  const selSub = document.getElementById('librarySubTabSelect');
  const gameId = (selGame?.value && selGame.value !== '__builtin__') ? selGame.value : null;
  const subTabId = selSub?.value || null;
  return { gameId, subTabId };
}

/**
 * サイドバーのプリセット一覧（読込・削除・リネーム）は app のタブを唯一の正とする。
 * マネージャのドロップダウンはメインのサブタブ切替後に同期されないことがあり、
 * そちらを優先すると「一覧に見えているアイテム」と別サブタブを参照してしまう。
 */
function _resolveAppGameAndSubTab() {
  return {
    gId: app.activeUserGameId,
    sId: app.activeUserSubTabId
  };
}

/**
 * マネージャのエクスポート（ZIP 等）用。ドロップダウンと app を統合する。
 * ゲームが「内蔵 PRESETS」のとき、サブタブだけが内蔵カテゴリ名（"real" 等）のまま残ると
 * `subTabId ?? app` が誤って "real" を選び、ユーザーゲームのサブタブと一致しなくなる。
 */
function _resolveGameAndSubTabForLibraryModal() {
  const { gameId, subTabId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  const sId = gameId ? (subTabId ?? app.activeUserSubTabId) : app.activeUserSubTabId;
  return { gId, sId, modalGameId: gameId, modalSubTabId: subTabId };
}

function _assertActiveUserSubTab() {
  return !!(app.activeUserGameId && app.activeUserSubTabId);
}

async function _getActiveSubTabItems() {
  const { gId, sId } = _resolveAppGameAndSubTab();
  debugLibrary('_getActiveSubTabItems', {
    source: 'app',
    resolvedGId: gId,
    resolvedSId: sId,
    appActiveGameId: app.activeUserGameId,
    appActiveSubTabId: app.activeUserSubTabId
  });
  if (!gId || !sId) {
    debugLibrary('_getActiveSubTabItems → empty (missing game or subtab id)');
    return { game: null, subTab: null, items: [] };
  }
  const game = await dbGetUserGame(gId);
  const sid = String(sId);
  const subTab = game?.subtabs?.find(s => String(s.id) === sid) || null;
  const items = subTab?.items || [];
  if (!game) debugLibrary('_getActiveSubTabItems: dbGetUserGame returned null', { gId });
  if (!subTab) {
    debugLibrary('_getActiveSubTabItems: subtab not found', {
      gId,
      sid,
      subtabIdsInGame: (game?.subtabs || []).map(s => ({ id: s.id, idType: typeof s.id }))
    });
  }
  debugLibrary('_getActiveSubTabItems → items.length', items.length);
  return { game, subTab, items };
}


export async function saveParamsToLibrary(name, params) {
  if (!app.activeUserGameId || !app.activeUserSubTabId) {
    showToast(t('library.selectGameSubtab'));
    return;
  }
  const stored = params != null ? normalizePresetParamsForStorage(params) : serializePresetForLibrary();
  await dbAddItemToSubTab(app.activeUserGameId, app.activeUserSubTabId, { name, params: stored });
  renderPresets();
  showToast(t('toast.saved', name));
}

export async function saveCurrentPreset() {
  if (!app.activeUserGameId || !app.activeUserSubTabId) {
    showToast(t('library.selectGameSubtab'));
    return;
  }
  const name = prompt(t('library.addPrompt'))?.trim();
  if (!name) return;

  await dbAddItemToSubTab(app.activeUserGameId, app.activeUserSubTabId, {
    name,
    params: serializePresetForLibrary()
  });
  renderPresets();
  showToast(t('toast.saved', name));
}

export async function deleteUserPreset(id) {
  const { gId, sId } = _resolveAppGameAndSubTab();
  debugLibrary('deleteUserPreset', { id, idType: typeof id, gId, sId, source: 'app' });
  if (!gId || !sId) {
    debugLibrary('deleteUserPreset aborted: missing gId or sId');
    return;
  }
  await dbDeleteItemFromSubTab(gId, sId, id);
  renderPresets();
  showToast(t('toast.deleted'));
}

export async function loadUserPreset(id) {
  debugLibrary('loadUserPreset called', { id, idType: typeof id, idAsString: String(id) });
  const assertOk = _assertActiveUserSubTab();
  if (!assertOk) {
    debugLibrary('loadUserPreset aborted: _assertActiveUserSubTab false', {
      modal: _getModalSelection(),
      appActiveGameId: app.activeUserGameId,
      appActiveSubTabId: app.activeUserSubTabId
    });
    return;
  }
  const { items, subTab, game } = await _getActiveSubTabItems();
  const sid = String(id);
  const p = items.find(x => String(x.id) === sid);
  if (!p) {
    debugLibrary('loadUserPreset: item not found in list', {
      lookedUpSid: sid,
      itemIds: items.map(x => ({ id: x.id, idType: typeof x.id, name: x.name }))
    });
    return;
  }
  debugLibrary('loadUserPreset: applying', { name: p.name, itemId: p.id, subTabName: subTab?.name, gameName: game?.name });

  applyPresetParamsFromLibrary(p.params);
  applyStateToUI();

  app.activePreset = p.name;

  // Highlight active item button (user library)
  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`pb-user-${p.id}`);
  if (btn) btn.classList.add('active');
  else debugLibrary('loadUserPreset: highlight skipped — getElementById miss', { domId: `pb-user-${p.id}`, itemId: p.id, itemIdType: typeof p.id });

  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.updatedAt ? t('info.savedAt', p.updatedAt) : '';

  closeManager();
  showToast(t('toast.loaded', p.name));
  // Auto play (conditional)
  if (state.autoPlayOnEdit) {
    debugLibrary('loadUserPreset: scheduling playSE (autoPlayOnEdit)');
    setTimeout(() => window.playSE?.(), 80);
  } else {
    debugLibrary('loadUserPreset: autoPlayOnEdit is off — no auto play');
  }
}

export async function exportAllJSON() {
  const { gameId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  if (!gId) { showToast(t('library.selectGame')); return; }
  const game = await dbGetUserGame(gId);
  if (!game) return;

  const totalItems = (game.subtabs || []).reduce((s, st) => s + (st.items || []).length, 0);
  if (!totalItems) { showToast(t('toast.noPresets')); return; }

  const blob = new Blob([JSON.stringify({
    version: 1,
    type: 'game',
    game: {
      name: game.name,
      subtabs: (game.subtabs || []).map(st => ({
        name: st.name,
        items: (st.items || []).map(({ name, params, updatedAt }) => ({ name, params, updatedAt }))
      }))
    }
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = game.name.replace(/[^\w\u3040-\u9fff]/g, '_') + '.json';
  a.click();
  showToast(t('toast.exported', totalItems));
}

export function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data?.type !== 'game' || !data.game) throw new Error('not game format');

      const gameName = data.game.name || 'Imported Game';
      const newGame = await dbCreateUserGame(gameName);
      let itemCount = 0;
      for (const st of (data.game.subtabs || [])) {
        const items = (st.items || [])
          .filter(it => it?.name && it?.params)
          // 外部 JSON の id は型混在・重複の原因になるため付け直す（name/params/updatedAt のみ引き継ぐ）
          .map(({ name, params, updatedAt }) => ({ name, params, updatedAt }));
        await dbCreateUserSubTab(newGame.id, st.name || 'Subtab', items);
        itemCount += items.length;
      }

      app.activeUserGameId = newGame.id;
      app.activeUserSubTabId = null;
      await refreshLibraryTabs();
      debugLibrary('importJSON OK', { newGameId: newGame.id, gameName, itemCount, activeUserGameId: app.activeUserGameId, activeUserSubTabId: app.activeUserSubTabId });
      showToast(t('toast.imported', itemCount));
    } catch (err) {
      console.error('[SEgene library] importJSON failed', err);
      debugLibrary('importJSON error (see console.error above)');
      showToast(t('toast.importFailed'));
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

export function openManager() {
  window.openLibraryModal?.();
}

export function closeManager() {
  window.closeLibraryModal?.();
}

// Rename handler
export async function renameItemInActiveSubTab(id, newName) {
  const { gId, sId } = _resolveAppGameAndSubTab();
  debugLibrary('renameItemInActiveSubTab', { id, idType: typeof id, newName, gId, sId, source: 'app' });
  if (!gId || !sId || !newName) {
    debugLibrary('renameItemInActiveSubTab aborted: missing gId, sId, or newName');
    return;
  }
  await dbRenameItemInSubTab(gId, sId, id, newName);
  renderPresets();
}

export async function renameUserItem(id) {
  const elId = `pb-user-${id}`;
  const row = document.getElementById(elId);
  debugLibrary('renameUserItem', { id, idType: typeof id, domId: elId, rowFound: !!row });
  const currentName = row?.querySelector('.preset-name')?.textContent?.trim() || '';
  const name = prompt(t('library.renamePrompt'), currentName)?.trim();
  if (!name) return;
  await renameItemInActiveSubTab(id, name);
}

// --- Bulk ZIP export helpers ---

function _safeName(s) {
  return (s || 'item').replace(/[^\w\u3040-\u9fff\-]/g, '_');
}

async function _renderItem(format, params) {
  if (format === 'wav') return { data: await renderParamsToWAV(params), ext: 'wav' };
  if (format === 'mp3') return { data: await renderParamsToMP3(params), ext: 'mp3' };
  if (format === 'ogg') return { data: await renderParamsToOGG(params), ext: 'ogg' };
  return null;
}

async function _buildAndDownloadZip(zip, zipName) {
  const JSZip = window.JSZip;
  if (!JSZip) { showToast(t('library.jszipMissing')); return; }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipName;
  a.click();
}

export async function exportSubTabZip(format) {
  const JSZip = window.JSZip;
  if (!JSZip) { showToast(t('library.jszipMissing')); return; }
  const { gId, sId } = _resolveGameAndSubTabForLibraryModal();
  if (!gId || !sId) { showToast(t('library.selectSubtab')); return; }
  const game = await dbGetUserGame(gId);
  const subTab = game?.subtabs?.find(s => String(s.id) === String(sId));
  const items = subTab?.items || [];
  if (!items.length) { showToast(t('library.noItems')); return; }
  showToast(t('toast.processing', items.length, format.toUpperCase()));
  const zip = new JSZip();
  let count = 0;
  for (const item of items) {
    const result = await _renderItem(format, item.params);
    if (result?.data) { zip.file(`${_safeName(item.name)}.${result.ext}`, result.data); count++; }
  }
  if (!count) { showToast(t('library.noItems')); return; }
  await _buildAndDownloadZip(zip, `${_safeName(subTab.name)}_${format}.zip`);
  showToast(t('toast.exportedCount', count));
}

export async function exportGameZip(format) {
  const JSZip = window.JSZip;
  if (!JSZip) { showToast(t('library.jszipMissing')); return; }
  const { gameId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  if (!gId) { showToast(t('library.selectGame')); return; }
  const game = await dbGetUserGame(gId);
  if (!game) return;
  const totalItems = (game.subtabs || []).reduce((s, st) => s + (st.items || []).length, 0);
  if (!totalItems) { showToast('アイテムがありません'); return; }
  showToast(t('toast.processing', totalItems, format.toUpperCase()));
  const zip = new JSZip();
  let count = 0;
  for (const st of (game.subtabs || [])) {
    const folder = zip.folder(_safeName(st.name));
    for (const item of (st.items || [])) {
      const result = await _renderItem(format, item.params);
      if (result?.data) { folder.file(`${_safeName(item.name)}.${result.ext}`, result.data); count++; }
    }
  }
  if (!count) { showToast(t('library.noItems')); return; }
  await _buildAndDownloadZip(zip, `${_safeName(game.name)}_${format}.zip`);
  showToast(t('toast.exportedCount', count));
}


