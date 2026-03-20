import { state } from './se-state.js';
import { playSE, masterGain } from './se-audio-engine.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider } from './se-editor-ui.js';
import { dbGetUserPresets, dbSaveUserPresets } from './se-db.js';
import { t, getLang } from './se-i18n.js';

async function renderSavedPresets() {
  const list = await dbGetUserPresets();
  const el = document.getElementById('savedPresetList');

  if (!list.length) {
    el.innerHTML = `<div class="empty-msg">${t('preset.empty')}</div>`;
    return;
  }

  el.innerHTML = list.slice().reverse().map(p => `
    <div class="saved-preset-row">
      <div style="flex:1;min-width:0">
        <div class="saved-preset-name">${p.name}</div>
        <div class="saved-preset-meta">${p.savedAt} &nbsp;·&nbsp; ${p.params.wave} / ${p.params.frequency}Hz</div>
      </div>
      <button class="btn-sm load" onclick="loadUserPreset(${p.id})">${t('preset.load')}</button>
      <button class="btn-sm" onclick="exportSingleJSON(${p.id})">⬇</button>
      <button class="btn-sm del" onclick="deleteUserPreset(${p.id})">${t('preset.delete')}</button>
    </div>
  `).join('');
}

export async function saveCurrentPreset() {
  const nameEl = document.getElementById('savePresetName');
  const name = nameEl.value.trim();
  if (!name) { showToast(t('toast.nameRequired')); return; }

  const list = await dbGetUserPresets();
  const entry = {
    id: Date.now(),
    name,
    savedAt: new Date().toLocaleString(t('locale')),
    params: { ...state }
  };

  // Overwrite if same name
  const idx = list.findIndex(p => p.name === name);
  if (idx >= 0) list[idx] = entry; else list.push(entry);

  await dbSaveUserPresets(list);
  nameEl.value = '';
  await renderSavedPresets();
  showToast(t('toast.saved', name));
}

export async function deleteUserPreset(id) {
  const list = (await dbGetUserPresets()).filter(p => p.id !== id);
  await dbSaveUserPresets(list);
  await renderSavedPresets();
  showToast(t('toast.deleted'));
}

export async function loadUserPreset(id) {
  const list = await dbGetUserPresets();
  const p = list.find(p => p.id === id);
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
  document.getElementById('presetInfoDesc').textContent = t('info.savedAt', p.savedAt);

  closeManager();
  showToast(t('toast.loaded', p.name));
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 80);
}

export async function exportAllJSON() {
  const list = await dbGetUserPresets();
  if (!list.length) { showToast(t('toast.noPresets')); return; }

  const blob = new Blob([JSON.stringify({ version: 1, presets: list }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'game-se-presets.json';
  a.click();
  showToast(t('toast.exported', list.length));
}

export async function exportSingleJSON(id) {
  const list = await dbGetUserPresets();
  const p = list.find(p => p.id === id);
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
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const incoming = data.presets || (Array.isArray(data) ? data : [data]);
      if (!incoming.length) throw new Error('empty');

      const list = await dbGetUserPresets();
      let added = 0;
      incoming.forEach(p => {
        if (!p.name || !p.params) return;
        p.id = Date.now() + Math.random();
        p.savedAt = p.savedAt || new Date().toLocaleString(t('locale'));
        const idx = list.findIndex(x => x.name === p.name);
        if (idx >= 0) list[idx] = p; else list.push(p);
        added++;
      });

      await dbSaveUserPresets(list);
      await renderSavedPresets();
      showToast(t('toast.imported', added));
    } catch {
      showToast(t('toast.importFailed'));
    }
    event.target.value = '';
  };

  reader.readAsText(file);
}

export function openManager() {
  renderSavedPresets(); // async, fire and forget
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('savePresetName').focus();
}

export function closeManager() {
  document.getElementById('modalOverlay').classList.remove('open');
}

// Re-render preset list when language changes
document.addEventListener('se:langchange', () => {
  if (document.getElementById('modalOverlay')?.classList.contains('open')) renderSavedPresets();
});

