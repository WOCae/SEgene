import { PRESETS } from './presets.js';
import {
  state, app, ensureLayers, pushActiveToLayers, pullLayerToState,
  createLayer, replaceLayersWithSingleFromFlat, pickSynthFromState
} from './se-state.js';
import { masterGain, playSE } from './se-audio-engine.js';
import { scheduleSessionSave, dbGetUserGame, dbReorderItemsInSubTab } from './se-db.js';
import { t, getLang } from './se-i18n.js';
import { debugLibrary } from './se-debug.js';

// ---------- Internal helpers ----------

const PARAM_IDS = ['attack', 'decay', 'release', 'frequency', 'sweep', 'cutoff', 'resonance', 'distortion', 'reverb', 'vibrato', 'duration'];

function _syncSliders() {
  PARAM_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = state[id]; updateParam(id, state[id]); }
  });
  const sustain = document.getElementById('sustain');
  if (sustain) {
    sustain.value = state.sustain * 100;
    updateParam('sustain', state.sustain * 100);
  }
}

// ---------- Param / Volume / Filter ----------

export function updateParam(id, val) {
  const v = parseFloat(val);
  state[id] = id === 'sustain' ? v / 100 : v;
  pushActiveToLayers();
  scheduleSessionSave();

  const labels = {
    attack: v + 'ms',
    decay: v + 'ms',
    sustain: (v / 100).toFixed(2),
    release: v + 'ms',
    frequency: v + 'Hz',
    sweep: v + 'Hz',
    cutoff: v + 'Hz',
    resonance: parseFloat(v).toFixed(1),
    distortion: parseInt(v),
    reverb: v + '%',
    vibrato: v + 'Hz',
    duration: (v / 1000).toFixed(2) + 's'
  };

  const labelElIds = { frequency: 'vFreq', resonance: 'vRes', distortion: 'vDist' };
  const labelId = labelElIds[id] ?? ('v' + id.charAt(0).toUpperCase() + id.slice(1));
  const el = document.getElementById(labelId);
  if (el) el.textContent = labels[id] || v;
}

export function syncVolumeSlider() {
  const el = document.getElementById('volume');
  const lab = document.getElementById('vVol');
  if (!el || !lab) return;

  let v = Number(state.volume);
  if (!Number.isFinite(v)) v = 0.8;
  v = Math.max(0, Math.min(1, v));

  state.volume = v;
  const pct = Math.round(v * 100);
  el.value = String(pct);
  lab.textContent = pct + '%';
  if (masterGain) masterGain.gain.value = v;

  const mEl = document.getElementById('mobileVolume');
  const mLab = document.getElementById('mobileVol');
  if (mEl) mEl.value = String(pct);
  if (mLab) mLab.textContent = pct + '%';
}

export function updateVolume(val) {
  state.volume = val / 100;
  document.getElementById('vVol').textContent = val + '%';
  if (masterGain) masterGain.gain.value = val / 100;
  scheduleSessionSave();
}

export function updateFilter() {
  state.filterType = document.getElementById('filterType').value;
  pushActiveToLayers();
  scheduleSessionSave();
}

// ---------- Wave / Category ----------

export function setWave(type, btn) {
  state.wave = type;
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  pushActiveToLayers();
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 50);
}

export function setCategory(cat, btn) {
  app.currentCategory = cat;
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;

  const gameTabs = document.getElementById('gameTabs');
  if (gameTabs) {
    gameTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('gt-builtin')?.classList.add('active');
  }

  const subTabs = document.getElementById('subTabs');
  if (subTabs) {
    subTabs.querySelectorAll('.cat-tab').forEach((b) => {
      b.classList.remove('active-8bit', 'active-real', 'active-ui', 'active-env', 'active');
    });
    if (btn) btn.classList.add('active-' + cat);
  }

  renderPresets();
  scheduleSessionSave();
}

// ---------- Preset list rendering ----------

let _draggingUserItemId = null;
let _lastUserItemOrderIds = [];

function _moveItemIdInArray(arr, from, to) {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

function _attachUserItemsDnD(list) {
  if (!app.libraryReorderMode) return;
  const gameId = app.activeUserGameId;
  const subTabId = app.activeUserSubTabId;
  if (!gameId || !subTabId) return;

  const rows = [...list.querySelectorAll('.preset-btn[data-item-id]')];
  const handles = [...list.querySelectorAll('.preset-item-dnd-handle')];
  _lastUserItemOrderIds = rows.map(r => r.dataset.itemId);

  handles.forEach((handle) => {
    const id = handle.dataset.itemId;
    if (!id) return;
    handle.addEventListener('dragstart', (e) => {
      _draggingUserItemId = id;
      handle.classList.add('is-dnd-dragging');
      const row = rows.find(r => r.dataset.itemId === id);
      row?.classList.add('is-dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
    });
    handle.addEventListener('dragend', () => {
      _draggingUserItemId = null;
      list.querySelectorAll('.preset-btn').forEach(x => x.classList.remove('is-dnd-over', 'is-dnd-dragging'));
      list.querySelectorAll('.preset-item-dnd-handle').forEach(x => x.classList.remove('is-dnd-dragging'));
    });
  });

  rows.forEach((row) => {
    const targetId = row.dataset.itemId;
    if (!targetId) return;

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('is-dnd-over');
      e.dataTransfer.dropEffect = 'move';
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('is-dnd-over');
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('is-dnd-over');
      if (!_draggingUserItemId || !_lastUserItemOrderIds.length) return;
      if (String(targetId) === String(_draggingUserItemId)) return;

      const from = _lastUserItemOrderIds.findIndex(x => String(x) === String(_draggingUserItemId));
      const to = _lastUserItemOrderIds.findIndex(x => String(x) === String(targetId));
      if (from < 0 || to < 0 || from === to) return;

      const newOrder = _moveItemIdInArray(_lastUserItemOrderIds, from, to);
      await dbReorderItemsInSubTab(gameId, subTabId, newOrder);
      renderPresets();
    });
  });
}

async function renderUserItems() {
  const list = document.getElementById('presetList');
  if (!list) {
    debugLibrary('renderUserItems: #presetList missing');
    return;
  }
  if (!app.activeUserGameId || !app.activeUserSubTabId) {
    debugLibrary('renderUserItems skipped: no active game/subtab', { activeUserGameId: app.activeUserGameId, activeUserSubTabId: app.activeUserSubTabId });
    return;
  }

  const game = await dbGetUserGame(app.activeUserGameId);
  const sid = String(app.activeUserSubTabId);
  const subTab = game?.subtabs?.find(st => String(st.id) === sid) || null;
  const items = subTab?.items || [];
  debugLibrary('renderUserItems', {
    activeUserGameId: app.activeUserGameId,
    activeUserSubTabId: app.activeUserSubTabId,
    gameName: game?.name,
    subTabName: subTab?.name,
    itemCount: items.length,
    items: items.map(p => ({ id: p.id, idType: typeof p.id, name: p.name }))
  });

  if (!items.length) {
    list.classList.remove('preset-list--reorder');
    list.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:10px">No SE items in this subtab</div>`;
    return;
  }

  const reorder = app.libraryReorderMode;
  list.classList.toggle('preset-list--reorder', reorder);

  list.innerHTML = items.map((p) => {
    const pr = p.params;
    const desc = (pr?.layers && pr.layers.length > 0)
      ? t('library.presetLayersDesc', String(pr.layers.length))
      : `${pr?.wave || ''} ${pr?.frequency ? `· ${pr.frequency}Hz` : ''}`;
    const handleHtml = reorder
      ? `<span class="preset-item-dnd-handle" draggable="true" data-item-id="${String(p.id)}" title="${t('library.reorderHandleTitle')}">⠿</span>`
      : '';
    return `
    <div class="preset-btn" data-item-id="${String(p.id)}" id="pb-user-${p.id}">
      ${handleHtml}
      <div class="preset-btn-load" onclick='loadUserPreset(${JSON.stringify(p.id)})'>
        <div class="preset-icon" style="background:rgba(108,99,255,.10);color:var(--accent2)">♪</div>
        <div class="preset-info">
          <div class="preset-name">${p.name || 'SE'}</div>
          <div class="preset-desc">${desc}</div>
        </div>
      </div>
      <div class="preset-item-actions">
        <button class="preset-item-btn" title="リネーム" onclick='renameUserItem(${JSON.stringify(p.id)})'>✎</button>
        <button class="preset-item-btn del" title="削除" onclick='deleteUserPreset(${JSON.stringify(p.id)})'>✕</button>
      </div>
    </div>
  `;
  }).join('');

  if (reorder) _attachUserItemsDnD(list);
}

function renderBuiltInPresets() {
  const list = document.getElementById('presetList');
  const presets = PRESETS[app.currentCategory] || [];
  const isEn = getLang() === 'en';
  if (!list) return;

  list.classList.remove('preset-list--reorder');
  list.innerHTML = presets.map((p, i) => `
    <button class="preset-btn" onclick="loadPreset('${app.currentCategory}',${i})" id="pb-${app.currentCategory}-${i}">
      <div class="preset-icon" style="background:${p.color}22;color:${p.color}">${p.icon}</div>
      <div class="preset-info">
        <div class="preset-name">${isEn ? (p.nameEn || p.name) : p.name}</div>
        <div class="preset-desc">${isEn ? (p.descEn || p.desc) : p.desc}</div>
      </div>
    </button>
  `).join('');
}

export function renderPresets() {
  const list = document.getElementById('presetList');
  if (!list) return;

  if (app.activeUserGameId && app.activeUserSubTabId) {
    debugLibrary('renderPresets → user library items', { activeUserGameId: app.activeUserGameId, activeUserSubTabId: app.activeUserSubTabId });
    void renderUserItems();
    return;
  }

  if (app.activeUserGameId && !app.activeUserSubTabId) {
    debugLibrary('renderPresets → user game but no subtab selected', { activeUserGameId: app.activeUserGameId });
    list.classList.remove('preset-list--reorder');
    list.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:10px">Select a subtab to show SE items</div>`;
    return;
  }

  debugLibrary('renderPresets → built-in PRESETS', { category: app.currentCategory });
  renderBuiltInPresets();
}

// ---------- Load preset ----------

export function loadPreset(cat, idx) {
  const p = PRESETS[cat][idx];
  app.activePreset = p.name;
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;
  Object.assign(state, p.p);
  replaceLayersWithSingleFromFlat();

  _syncSliders();
  syncVolumeSlider();
  renderLayerStrip();

  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach((b) => {
    b.classList.toggle('active', b.textContent === waveNames[p.p.wave]);
  });

  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`pb-${cat}-${idx}`);
  if (btn) btn.classList.add('active');

  const isEn = getLang() === 'en';
  document.getElementById('presetInfoName').textContent = isEn ? (p.nameEn || p.name) : p.name;
  document.getElementById('presetInfoDesc').textContent = isEn ? (p.descEn || p.desc) : p.desc;

  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 50);
}

// ---------- Apply state to UI (session restore) ----------

export function applyStateToUI() {
  ensureLayers();
  _syncSliders();

  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));

  const filterEl = document.getElementById('filterType');
  if (filterEl && state.filterType) filterEl.value = state.filterType;

  syncVolumeSlider();
  renderLayerStrip();
}

// ---------- Randomize ----------

export function randomize() {
  const waves = ['square', 'sine', 'sawtooth', 'triangle', 'noise'];
  state.wave = waves[Math.floor(Math.random() * waves.length)];
  state.frequency = Math.round(Math.random() * 1800 + 80);
  state.attack = Math.round(Math.random() * 200 + 1);
  state.decay = Math.round(Math.random() * 500 + 50);
  state.sustain = Math.random() * 0.7;
  state.release = Math.round(Math.random() * 800 + 100);
  state.sweep = Math.round((Math.random() - 0.5) * 1000);
  state.cutoff = Math.round(Math.random() * 15000 + 500);
  state.resonance = Math.round(Math.random() * 100) / 10;
  state.distortion = Math.round(Math.random() * 150);
  state.reverb = Math.round(Math.random() * 50);
  state.vibrato = Math.round(Math.random() * 12 * 2) / 2;
  state.duration = Math.round(Math.random() * 1500 + 100);

  pushActiveToLayers();
  _syncSliders();

  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.toggle('active', b.textContent === waveNames[state.wave]));

  document.getElementById('presetInfoName').textContent = t('info.random');
  document.getElementById('presetInfoDesc').textContent = t('info.randomDesc');

  renderLayerStrip();
  setTimeout(() => playSE(), 50);
}

// ---------- Layers (mix multiple SE) ----------

export function renderLayerStrip() {
  const host = document.getElementById('layerStrip');
  if (!host) return;
  ensureLayers();
  const layers = state.layers;
  const active = state.activeLayerIndex;

  host.innerHTML = layers.map((L, i) => {
    const isAct = i === active;
    const mixPct = Math.round(Math.max(0, Math.min(1, L.mix)) * 100);
    return `
      <div class="layer-card ${isAct ? 'is-active' : ''} ${L.muted ? 'is-muted' : ''}" data-layer-idx="${i}">
        <button type="button" class="layer-card-tab" onclick="layerSelect(${i})" title="${t('layers.editLayer')}">${L.name || ('L' + (i + 1))}</button>
        <label class="layer-mini"><span data-i18n="layers.mixShort">${t('layers.mixShort')}</span>
          <input type="range" min="0" max="100" value="${mixPct}" oninput="layerMixChange(${i},this.value)"/>
        </label>
        <label class="layer-mini"><span data-i18n="layers.delayShort">${t('layers.delayShort')}</span>
          <input type="number" class="layer-delay-input" min="0" max="5000" step="1" value="${L.delayMs || 0}" onchange="layerDelayChange(${i},this.value)"/>
        </label>
        <button type="button" class="layer-mute-btn" onclick="layerToggleMute(${i})" title="${t('layers.mute')}">${L.muted ? 'M' : '○'}</button>
        ${layers.length > 1 ? `<button type="button" class="layer-del-btn" onclick="layerRemove(${i})" title="${t('layers.remove')}">×</button>` : ''}
      </div>
    `;
  }).join('');

  const addBtn = document.getElementById('layerAddBtn');
  if (addBtn) addBtn.title = t('layers.add');
}

export function layerSelect(idx) {
  pushActiveToLayers();
  pullLayerToState(idx);
  _syncSliders();
  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));
  const filterEl = document.getElementById('filterType');
  if (filterEl && state.filterType) filterEl.value = state.filterType;
  syncVolumeSlider();
  renderLayerStrip();
  scheduleSessionSave();
}

export function layerAdd() {
  pushActiveToLayers();
  const n = state.layers.length + 1;
  state.layers.push(createLayer(t('layers.defaultName', String(n)), pickSynthFromState(state)));
  state.activeLayerIndex = state.layers.length - 1;
  pullLayerToState(state.activeLayerIndex);
  _syncSliders();
  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));
  const filterEl = document.getElementById('filterType');
  if (filterEl && state.filterType) filterEl.value = state.filterType;
  renderLayerStrip();
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 50);
}

export function layerRemove(idx) {
  ensureLayers();
  if (state.layers.length <= 1) return;
  pushActiveToLayers();
  let ai = state.activeLayerIndex;
  if (idx < ai) ai--;
  else if (idx === ai) ai = Math.min(ai, state.layers.length - 2);
  state.layers.splice(idx, 1);
  state.activeLayerIndex = Math.max(0, Math.min(ai, state.layers.length - 1));
  pullLayerToState(state.activeLayerIndex);
  _syncSliders();
  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));
  const filterEl = document.getElementById('filterType');
  if (filterEl && state.filterType) filterEl.value = state.filterType;
  syncVolumeSlider();
  renderLayerStrip();
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 50);
}

export function layerMixChange(idx, val) {
  ensureLayers();
  const L = state.layers[idx];
  if (!L) return;
  L.mix = Math.max(0, Math.min(1, parseFloat(val) / 100));
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 40);
}

export function layerDelayChange(idx, val) {
  ensureLayers();
  const L = state.layers[idx];
  if (!L) return;
  L.delayMs = Math.max(0, Math.min(5000, parseInt(val, 10) || 0));
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 40);
}

export function layerToggleMute(idx) {
  ensureLayers();
  const L = state.layers[idx];
  if (!L) return;
  L.muted = !L.muted;
  const card = document.querySelector(`.layer-card[data-layer-idx="${idx}"]`);
  if (card) {
    card.classList.toggle('is-muted', L.muted);
    const btn = card.querySelector('.layer-mute-btn');
    if (btn) btn.textContent = L.muted ? 'M' : '○';
  }
  scheduleSessionSave();
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 40);
}

// Re-render preset list when language changes
document.addEventListener('se:langchange', () => {
  renderPresets();
  renderLayerStrip();
});
