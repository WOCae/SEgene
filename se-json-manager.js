import { state, app } from './se-state.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider, renderPresets } from './se-editor-ui.js';
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

function _getModalSelection() {
  const selGame = document.getElementById('libraryGameSelect');
  const selSub = document.getElementById('librarySubTabSelect');
  const gameId = (selGame?.value && selGame.value !== '__builtin__') ? selGame.value : null;
  const subTabId = selSub?.value || null;
  return { gameId, subTabId };
}

function _assertActiveUserSubTab() {
  const { gameId, subTabId } = _getModalSelection();
  if (gameId && subTabId) return true;
  if (!app.activeUserGameId || !app.activeUserSubTabId) return false;
  return true;
}

async function _getActiveSubTabItems() {
  const { gameId, subTabId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  const sId = subTabId ?? app.activeUserSubTabId;
  if (!gId || !sId) return { game: null, subTab: null, items: [] };
  const game = await dbGetUserGame(gId);
  const sid = String(sId);
  const subTab = game?.subtabs?.find(s => String(s.id) === sid) || null;
  const items = subTab?.items || [];
  return { game, subTab, items };
}


export async function saveParamsToLibrary(name, params) {
  if (!app.activeUserGameId || !app.activeUserSubTabId) {
    showToast(t('library.selectGameSubtab'));
    return;
  }
  await dbAddItemToSubTab(app.activeUserGameId, app.activeUserSubTabId, { name, params });
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
    params: { ...state }
  });
  renderPresets();
  showToast(t('toast.saved', name));
}

export async function deleteUserPreset(id) {
  const { gameId, subTabId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  const sId = subTabId ?? app.activeUserSubTabId;
  if (!gId || !sId) return;
  await dbDeleteItemFromSubTab(gId, sId, id);
  renderPresets();
  showToast(t('toast.deleted'));
}

export async function loadUserPreset(id) {
  if (!_assertActiveUserSubTab()) return;
  const { items } = await _getActiveSubTabItems();
  const p = items.find(x => x.id === id);
  if (!p) return;

  Object.assign(state, p.params);

  const ids = ['attack', 'decay', 'release', 'frequency', 'sweep', 'cutoff', 'resonance', 'distortion', 'reverb', 'vibrato', 'duration'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = state[id];
      updateParam(id, state[id]);
    }
  });

  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);

  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));

  if (state.filterType) document.getElementById('filterType').value = state.filterType;
  syncVolumeSlider();

  app.activePreset = p.name;

  // Highlight active item button (user library)
  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`pb-user-${p.id}`);
  if (btn) btn.classList.add('active');

  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.updatedAt ? t('info.savedAt', p.updatedAt) : '';

  closeManager();
  showToast(t('toast.loaded', p.name));
  // Auto play (conditional)
  if (state.autoPlayOnEdit) setTimeout(() => window.playSE?.(), 80);
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
        const items = (st.items || []).filter(it => it?.name && it?.params);
        await dbCreateUserSubTab(newGame.id, st.name || 'Subtab', items);
        itemCount += items.length;
      }

      app.activeUserGameId = newGame.id;
      app.activeUserSubTabId = null;
      await window.refreshLibraryTabs?.();
      showToast(t('toast.imported', itemCount));
    } catch {
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
  const { gameId, subTabId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  const sId = subTabId ?? app.activeUserSubTabId;
  if (!gId || !sId || !newName) return;
  await dbRenameItemInSubTab(gId, sId, id, newName);
  renderPresets();
}

export async function renameUserItem(id) {
  const currentName = document.getElementById(`pb-user-${id}`)?.querySelector('.preset-name')?.textContent?.trim() || '';
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
  const { gameId, subTabId } = _getModalSelection();
  const gId = gameId ?? app.activeUserGameId;
  const sId = subTabId ?? app.activeUserSubTabId;
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


