import { state, app } from './se-state.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider, renderPresets } from './se-editor-ui.js';
import {
  dbGetUserGame,
  dbAddItemToSubTab,
  dbDeleteItemFromSubTab,
  dbRenameItemInSubTab
} from './se-db.js';
import { t } from './se-i18n.js';

function _assertActiveUserSubTab() {
  if (!app.activeUserGameId || !app.activeUserSubTabId) return false;
  return true;
}

async function _getActiveSubTabItems() {
  if (!_assertActiveUserSubTab()) return { game: null, subTab: null, items: [] };
  const game = await dbGetUserGame(app.activeUserGameId);
  const sid = String(app.activeUserSubTabId);
  const subTab = game?.subtabs?.find(s => String(s.id) === sid) || null;
  const items = subTab?.items || [];
  return { game, subTab, items };
}

async function renderSavedPresets() {
  const { items } = await _getActiveSubTabItems();
  const el = document.getElementById('savedPresetList');

  if (!items.length) {
    el.innerHTML = `<div class="empty-msg">${t('preset.empty')}</div>`;
    return;
  }

  el.innerHTML = items.slice().reverse().map(p => `
    <div class="saved-preset-row">
      <div style="flex:1;min-width:0">
        <div class="saved-preset-name"
          contenteditable="true"
          spellcheck="false"
          onblur="renameItemInActiveSubTab(${p.id}, this.textContent.trim())"
        >${p.name}</div>
        <div class="saved-preset-meta">${p.updatedAt || ''} &nbsp;·&nbsp; ${p.params?.wave ?? ''} / ${p.params?.frequency ?? ''}Hz</div>
      </div>
      <button class="btn-sm load" onclick="loadUserPreset(${p.id})">${t('preset.load')}</button>
      <button class="btn-sm" onclick="exportSingleJSON(${p.id})">⬇</button>
      <button class="btn-sm del" onclick="deleteUserPreset(${p.id})">${t('preset.delete')}</button>
    </div>
  `).join('');
}

export async function saveCurrentPreset() {
  if (!_assertActiveUserSubTab()) { showToast('先にユーザーのサブタブを選択してください'); return; }
  const nameEl = document.getElementById('savePresetName');
  const name = nameEl.value.trim();
  if (!name) { showToast(t('toast.nameRequired')); return; }

  await dbAddItemToSubTab(app.activeUserGameId, app.activeUserSubTabId, {
    name,
    params: { ...state }
  });
  nameEl.value = '';
  await renderSavedPresets();
  // Sidebar を即時更新（サブタブクリック待ちにしない）
  renderPresets();
  showToast(t('toast.saved', name));
}

export async function deleteUserPreset(id) {
  if (!_assertActiveUserSubTab()) return;
  await dbDeleteItemFromSubTab(app.activeUserGameId, app.activeUserSubTabId, id);
  await renderSavedPresets();
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
  if (!_assertActiveUserSubTab()) { showToast('サブタブを選択してください'); return; }
  const { items, subTab, game } = await (async () => {
    const x = await _getActiveSubTabItems();
    return { items: x.items, subTab: x.subTab, game: x.game };
  })();
  if (!items.length) { showToast(t('toast.noPresets')); return; }

  const blob = new Blob([JSON.stringify({
    version: 1,
    type: 'subtab',
    game: { id: game?.id, name: game?.name },
    subTab: { id: subTab?.id, name: subTab?.name },
    items
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (subTab?.name || 'subtab').replace(/[^\w\u3040-\u9fff]/g, '_') + '.json';
  a.click();
  showToast(t('toast.exported', items.length));
}

export async function exportSingleJSON(id) {
  if (!_assertActiveUserSubTab()) return;
  const { items } = await _getActiveSubTabItems();
  const p = items.find(x => x.id === id);
  if (!p) return;

  const blob = new Blob([JSON.stringify({ version: 1, type: 'item', item: p }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = p.name.replace(/[^\w\u3040-\u9fff]/g, '_') + '.json';
  a.click();
}

export function importJSON(event) {
  if (!_assertActiveUserSubTab()) { showToast('サブタブを選択してください'); return; }
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let incomingItems = [];
      if (data?.type === 'subtab' && Array.isArray(data.items)) incomingItems = data.items;
      else if (data?.type === 'item' && data.item) incomingItems = [data.item];
      else if (Array.isArray(data?.presets)) incomingItems = data.presets;
      else if (Array.isArray(data)) incomingItems = data;

      if (!incomingItems.length) throw new Error('empty');

      let added = 0;
      for (const p of incomingItems) {
        if (!p?.name || !p?.params) continue;
        await dbAddItemToSubTab(app.activeUserGameId, app.activeUserSubTabId, {
          name: p.name,
          params: p.params
        });
        added++;
      }

      await renderSavedPresets();
      renderPresets();
      showToast(t('toast.imported', added));
    } catch {
      showToast(t('toast.importFailed'));
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

export function openManager() {
  // If Library Modal is open, sync selection from dropdown.
  const libOverlayOpen = document.getElementById('libraryModalOverlay')?.classList.contains('open');
  if (libOverlayOpen) {
    const selGame = document.getElementById('libraryGameSelect');
    const selSub = document.getElementById('librarySubTabSelect');
    if (selGame && selSub) {
      if (selGame.value === '__builtin__') { showToast('Fixed library is read-only'); return; }
      app.activeUserGameId = selGame.value || null;
      app.activeUserSubTabId = selSub.value || null;
    }
  }

  renderSavedPresets(); // async, fire and forget
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('savePresetName').focus();
}

export function closeManager() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// Rename handler (for inline editing)
export async function renameItemInActiveSubTab(id, newName) {
  if (!_assertActiveUserSubTab()) return;
  if (!newName) return;
  await dbRenameItemInSubTab(app.activeUserGameId, app.activeUserSubTabId, id, newName);
  await renderSavedPresets();
  renderPresets();
}

// Re-render list when language changes
document.addEventListener('se:langchange', () => {
  if (document.getElementById('modalOverlay')?.classList.contains('open')) renderSavedPresets();
});

