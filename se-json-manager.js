import { state } from './se-state.js';
import { playSE, masterGain } from './se-audio-engine.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider } from './se-editor-ui.js';

const STORAGE_KEY = 'gameSEUserPresets';

function getUserPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveUserPresets(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function renderSavedPresets() {
  const list = getUserPresets();
  const el = document.getElementById('savedPresetList');

  if (!list.length) {
    el.innerHTML = '<div class="empty-msg">保存済みプリセットはありません</div>';
    return;
  }

  el.innerHTML = list.slice().reverse().map(p => `
    <div class="saved-preset-row">
      <div style="flex:1;min-width:0">
        <div class="saved-preset-name">${p.name}</div>
        <div class="saved-preset-meta">${p.savedAt} &nbsp;·&nbsp; ${p.params.wave} / ${p.params.frequency}Hz</div>
      </div>
      <button class="btn-sm load" onclick="loadUserPreset(${p.id})">読込</button>
      <button class="btn-sm" onclick="exportSingleJSON(${p.id})">⬇</button>
      <button class="btn-sm del" onclick="deleteUserPreset(${p.id})">削除</button>
    </div>
  `).join('');
}

export function saveCurrentPreset() {
  const nameEl = document.getElementById('savePresetName');
  const name = nameEl.value.trim();
  if (!name) { showToast('名前を入力してください'); return; }

  const list = getUserPresets();
  const entry = {
    id: Date.now(),
    name,
    savedAt: new Date().toLocaleString('ja-JP'),
    params: { ...state }
  };

  // Overwrite if same name
  const idx = list.findIndex(p => p.name === name);
  if (idx >= 0) list[idx] = entry; else list.push(entry);

  saveUserPresets(list);
  nameEl.value = '';
  renderSavedPresets();
  showToast('「' + name + '」を保存しました');
}

export function deleteUserPreset(id) {
  const list = getUserPresets().filter(p => p.id !== id);
  saveUserPresets(list);
  renderSavedPresets();
  showToast('削除しました');
}

export function loadUserPreset(id) {
  const p = getUserPresets().find(p => p.id === id);
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

  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.savedAt + ' に保存';

  closeManager();
  showToast('「' + p.name + '」を読み込みました');
  setTimeout(() => playSE(), 80);
}

export function exportAllJSON() {
  const list = getUserPresets();
  if (!list.length) { showToast('保存済みプリセットがありません'); return; }

  const blob = new Blob([JSON.stringify({ version: 1, presets: list }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'game-se-presets.json';
  a.click();
  showToast(list.length + '件エクスポートしました');
}

export function exportSingleJSON(id) {
  const p = getUserPresets().find(p => p.id === id);
  if (!p) return;

  const blob = new Blob([JSON.stringify({ version: 1, presets: [p] }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = p.name.replace(/[^\w\u3040-\u9fff]/g, '_') + '.json';
  a.click();
}

export function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const incoming = data.presets || (Array.isArray(data) ? data : [data]);
      if (!incoming.length) throw new Error('empty');

      const list = getUserPresets();
      let added = 0;
      incoming.forEach(p => {
        if (!p.name || !p.params) return;
        p.id = Date.now() + Math.random();
        p.savedAt = p.savedAt || new Date().toLocaleString('ja-JP');
        const idx = list.findIndex(x => x.name === p.name);
        if (idx >= 0) list[idx] = p; else list.push(p);
        added++;
      });

      saveUserPresets(list);
      renderSavedPresets();
      showToast(added + '件インポートしました');
    } catch {
      showToast('JSONの読み込みに失敗しました');
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

export function openManager() {
  renderSavedPresets();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('savePresetName').focus();
}

export function closeManager() {
  document.getElementById('modalOverlay').classList.remove('open');
}

