import { PRESETS } from './presets.js';
import { state, app } from './se-state.js';
import { masterGain, playSE } from './se-audio-engine.js';
import {
  scheduleSessionSave,
  dbGetUserGames,
  dbGetUserGame,
  dbCreateUserGame,
  dbRenameUserGame,
  dbDeleteUserGame,
  dbCopyUserGame,
  dbCreateUserSubTab,
  dbRenameUserSubTab,
  dbDeleteUserSubTab,
  dbCopyUserSubTab,
  dbReorderUserGames,
  dbReorderUserSubTabs
} from './se-db.js';
import { t, getLang } from './se-i18n.js';

let _draggingGameId = null;
let _draggingSubTabId = null;
let _lastUserGameOrderIds = [];
let _lastUserSubTabOrderIds = [];

function _moveIdInArray(arr, from, to) {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

function _orderCmp(a, b) {
  const ao = a?.order;
  const bo = b?.order;
  const an = ao == null ? null : Number(ao);
  const bn = bo == null ? null : Number(bo);
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  return an - bn;
}

function _isLibraryModalOpen() {
  return document.getElementById('libraryModalOverlay')?.classList.contains('open') ?? false;
}

function _getModalSelection() {
  const selGame = document.getElementById('libraryGameSelect');
  const selSub = document.getElementById('librarySubTabSelect');
  if (!selGame || !selSub) return null;
  return { gameVal: selGame.value, subVal: selSub.value };
}

function _syncAppSelectionFromModalIfOpen() {
  if (!_isLibraryModalOpen()) return false;
  const m = _getModalSelection();
  if (!m) return false;
  // built-in is read-only; let caller handle if needed
  app.activeUserGameId = m.gameVal && m.gameVal !== '__builtin__' ? m.gameVal : null;
  app.activeUserSubTabId = m.gameVal && m.gameVal !== '__builtin__' ? (m.subVal || null) : null;
  return true;
}

async function _syncLibraryModalFromApp() {
  if (!_isLibraryModalOpen()) return;
  // game の option を作り直さないと、コピー/削除後に dropdown が更新されない
  await _fillLibraryModalGameSelect();
  const selGame = document.getElementById('libraryGameSelect');
  const selSub = document.getElementById('librarySubTabSelect');
  if (!selGame || !selSub) return;

  const wantGame = app.activeUserGameId ? String(app.activeUserGameId) : '__builtin__';
  selGame.value = wantGame;

  await _fillLibraryModalSubTabSelect();

  if (app.activeUserGameId && app.activeUserSubTabId) {
    const want = String(app.activeUserSubTabId);
    const opt = [...selSub.options].find(o => o.value === want);
    if (opt) selSub.value = want;
    else if (selSub.options[0]) selSub.value = selSub.options[0].value;
  } else if (app.activeUserGameId && selSub.options[0]) {
    // user game but no active subtab: default to first
    selSub.value = selSub.options[0].value;
  } else if (!selGame.value || selGame.value === '__builtin__') {
    // built-in: keep category in sync
    selSub.value = app.currentCategory || selSub.options[0]?.value || '';
  }
}

async function _fillLibraryModalGameSelect() {
  const sel = document.getElementById('libraryGameSelect');
  if (!sel) return;
  const games = await dbGetUserGames();
  sel.innerHTML = '';
  sel.innerHTML += `<option value="__builtin__">PRESETS (Fixed library)</option>`;
  for (const g of games) {
    sel.innerHTML += `<option value="${g.id}">${g.name}</option>`;
  }
}

async function _fillLibraryModalSubTabSelect() {
  const selGame = document.getElementById('libraryGameSelect');
  const sel = document.getElementById('librarySubTabSelect');
  if (!selGame || !sel) {
    console.error('[libraryModal] missing selects:', !!selGame, !!sel);
    return;
  }

  const gameVal = selGame.value;
  sel.innerHTML = '';

  if (gameVal === '__builtin__') {
    const cats = [
      { id: '8bit', label: '8BIT' },
      { id: 'real', label: 'REAL' },
      { id: 'ui', label: 'UI' },
      { id: 'env', label: 'ENV' }
    ];
    for (const c of cats) sel.innerHTML += `<option value="${c.id}">${c.label}</option>`;
    return;
  }

  const game = await dbGetUserGame(gameVal);
  const subtabs = game?.subtabs || [];
  if (!subtabs.length) {
    sel.innerHTML = `<option value="">(No subtabs)</option>`;
    return;
  }
  for (const st of subtabs) sel.innerHTML += `<option value="${st.id}">${st.name}</option>`;
}

export async function openLibraryModal() {
  const overlay = document.getElementById('libraryModalOverlay');
  if (!overlay) return;

  try {
    await _fillLibraryModalGameSelect();

    // Preselect current selection
    const selGame = document.getElementById('libraryGameSelect');
    if (selGame) {
      if (app.activeUserGameId) selGame.value = app.activeUserGameId;
      else selGame.value = '__builtin__';
    }

    // When game selection changes inside modal, update subtabs list
    if (selGame && !selGame.dataset._subtabListenerAttached) {
      selGame.addEventListener('change', async () => {
        await _fillLibraryModalSubTabSelect();
        const selSub = document.getElementById('librarySubTabSelect');
        if (selSub && selSub.options.length) {
          const desired = app.activeUserSubTabId;
          const opt = desired ? [...selSub.options].find(o => o.value === String(desired)) : null;
          selSub.value = opt ? desired : (selSub.options[0]?.value || '');
        }
      });
      selGame.dataset._subtabListenerAttached = '1';
    }

    await _fillLibraryModalSubTabSelect();

    const selSub = document.getElementById('librarySubTabSelect');
    if (selSub) {
      const desired = app.activeUserSubTabId;
      const options = [...selSub.options];
      const opt = desired ? options.find(o => o.value === String(desired)) : null;
      if (opt) selSub.value = desired;
      else if (options.length) selSub.value = options[0]?.value || '';
    }

    overlay.classList.add('open');
  } catch (e) {
    console.error('[libraryModal] open failed:', e);
    overlay.classList.add('open'); // best-effort open
  }
}

export function closeLibraryModal() {
  document.getElementById('libraryModalOverlay')?.classList.remove('open');
}

export async function applyLibraryModalSelection() {
  const selGame = document.getElementById('libraryGameSelect');
  const selSub = document.getElementById('librarySubTabSelect');
  if (!selGame || !selSub) return;

  const gameVal = selGame.value;
  const subVal = selSub.value;

  if (gameVal === '__builtin__') {
    app.activeUserGameId = null;
    app.activeUserSubTabId = null;
    // builtin child tab
    app.currentCategory = subVal || '8bit';
    renderPresets();
    void refreshLibraryTabs();
    closeLibraryModal();
    return;
  }

  app.activeUserGameId = gameVal || null;
  app.activeUserSubTabId = subVal || null;
  await refreshLibraryTabs();
  closeLibraryModal();
}

export function updateParam(id, val) {
  const v = parseFloat(val);
  state[id] = id === 'sustain' ? v / 100 : v;
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

  // Sync mobile volume slider if present
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
  scheduleSessionSave();
}

export function setWave(type, btn) {
  state.wave = type;
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  scheduleSessionSave();
}

export function setCategory(cat, btn) {
  // Built-in (fixed) presets selection
  app.currentCategory = cat;
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;

  const gameTabs = document.getElementById('gameTabs');
  if (gameTabs) {
    gameTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('gt-builtin')?.classList.add('active');
  }

  // Only update the subtab strip
  const subTabs = document.getElementById('subTabs');
  if (subTabs) {
    subTabs.querySelectorAll('.cat-tab').forEach((b) => {
      b.classList.remove('active-8bit', 'active-real', 'active-ui', 'active-env', 'active');
    });
    if (btn) btn.classList.add('active-' + cat);
  }

  renderPresets(); // compatibility (calls renderActiveItemsList internally)
  scheduleSessionSave();
}

async function renderUserItems() {
  const list = document.getElementById('presetList');
  if (!list) return;
  if (!app.activeUserGameId || !app.activeUserSubTabId) return;

  const game = await dbGetUserGame(app.activeUserGameId);
  const sid = String(app.activeUserSubTabId);
  const subTab = game?.subtabs?.find(st => String(st.id) === sid) || null;
  const items = subTab?.items || [];
  const isEn = getLang() === 'en';

  if (!items.length) {
    list.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:10px">No SE items in this subtab</div>`;
    return;
  }

  list.innerHTML = items.map((p) => `
    <button class="preset-btn" onclick="loadUserPreset(${p.id})" id="pb-user-${p.id}">
      <div class="preset-icon" style="background:rgba(108,99,255,.10);color:var(--accent2)">♪</div>
      <div class="preset-info">
        <div class="preset-name">${isEn ? (p.name || 'SE') : (p.name || 'SE')}</div>
        <div class="preset-desc">${p.params?.wave || ''} ${p.params?.frequency ? `· ${p.params.frequency}Hz` : ''}</div>
      </div>
    </button>
  `).join('');
}

function renderBuiltInPresets() {
  const list = document.getElementById('presetList');
  const presets = PRESETS[app.currentCategory] || [];
  const isEn = getLang() === 'en';
  if (!list) return;

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
  // Built-in or user items depending on active selection
  const list = document.getElementById('presetList');
  if (!list) return;

  if (app.activeUserGameId && app.activeUserSubTabId) {
    void renderUserItems();
    return;
  }

  if (app.activeUserGameId && !app.activeUserSubTabId) {
    list.innerHTML = `<div style="color:var(--text3);font-size:11px;padding:10px">Select a subtab to show SE items</div>`;
    return;
  }

  renderBuiltInPresets();
}

export function loadPreset(cat, idx) {
  const p = PRESETS[cat][idx];
  app.activePreset = p.name;
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;
  Object.assign(state, p.p);

  // Update UI
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

  syncVolumeSlider();

  // Wave button
  document.querySelectorAll('.wave-btn').forEach((b) => {
    b.classList.toggle(
      'active',
      b.textContent === p.p.wave.toUpperCase()
        || (p.p.wave === 'noise' && b.textContent === 'NOISE')
        || (p.p.wave === 'sawtooth' && b.textContent === 'SAW')
    );
  });

  // Highlight preset
  document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById(`pb-${cat}-${idx}`);
  if (btn) btn.classList.add('active');

  // Info
  const isEn = getLang() === 'en';
  document.getElementById('presetInfoName').textContent = isEn ? (p.nameEn || p.name) : p.name;
  document.getElementById('presetInfoDesc').textContent = isEn ? (p.descEn || p.desc) : p.desc;

  // Auto play (conditional)
  if (state.autoPlayOnEdit) setTimeout(() => playSE(), 50);
}

// ---------- Library (tabs) ----------

function _renderLibraryActionsPlaceholder() {
  const el = document.getElementById('libraryActions');
  if (!el) return;
  el.innerHTML = '';
}

function _btnSecondary(label, onclick) {
  return `<button class="btn-secondary" style="width:auto" onclick="${onclick}">${label}</button>`;
}

export async function initLibraryTabs() {
  await refreshLibraryTabs();
}

export async function refreshLibraryTabs() {
  const gameTabs = document.getElementById('gameTabs');
  const subTabs = document.getElementById('subTabs');
  if (!gameTabs || !subTabs) return;

  const games = await dbGetUserGames();
  gameTabs.innerHTML = '';

  // Built-in parent tab
  const builtInActive = app.activeUserGameId ? '' : ' active';
  gameTabs.innerHTML += `
    <button class="cat-tab${builtInActive}" onclick="selectBuiltInLibrary(this)" id="gt-builtin">PRESETS</button>
  `;

  games.sort(_orderCmp);
  _lastUserGameOrderIds = games.map(g => g.id);
  for (const g of games) {
    const active = app.activeUserGameId != null && String(app.activeUserGameId) === String(g.id) ? ' active' : '';
    gameTabs.innerHTML += `
      <button class="cat-tab${active}" onclick="selectUserGame(${JSON.stringify(g.id)},this)" data-game-id="${g.id}">${g.name}</button>
    `;
  }

  // Add-game tab at the right side of the same row
  gameTabs.innerHTML += `
    <button class="cat-tab library-add-game-tab" onclick="addUserGame()" title="Add game">＋ Game</button>
  `;

  // Ensure a valid selection
  if (app.activeUserGameId) {
    const game = games.find(x => x.id === app.activeUserGameId) || await dbGetUserGame(app.activeUserGameId);
    if (!game) {
      app.activeUserGameId = null;
      app.activeUserSubTabId = null;
    }
    // Keep the game selection even if there are no subtabs yet.
    if (game && !(game.subtabs || []).length) {
      app.activeUserSubTabId = null;
    }
  }

  // Render sub tabs based on parent selection
  await renderSubTabs();
  // Safeguard: if a user game is selected but subtab isn't, select the first one
  if (app.activeUserGameId && !app.activeUserSubTabId) {
    const game = games.find(x => x.id === app.activeUserGameId) || await dbGetUserGame(app.activeUserGameId);
    const first = game?.subtabs?.[0];
    if (first) app.activeUserSubTabId = first.id;
  }
  _renderLibraryActions();
  renderPresets();

  _attachGameTabsDnD();
}

function _attachGameTabsDnD() {
  const gameTabs = document.getElementById('gameTabs');
  if (!gameTabs) return;

  const btns = [...gameTabs.querySelectorAll('button[data-game-id]')];
  btns.forEach(b => {
    b.setAttribute('draggable', 'true');
  });

  btns.forEach(btn => {
    const gameId = btn.dataset.gameId;
    if (!gameId) return;

    btn.addEventListener('dragstart', (e) => {
      _draggingGameId = gameId;
      btn.classList.add('is-dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', gameId); } catch { /* ignore */ }
    });

    btn.addEventListener('dragend', () => {
      _draggingGameId = null;
      btns.forEach(x => x.classList.remove('is-dnd-over', 'is-dnd-dragging'));
    });

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('is-dnd-over');
      e.dataTransfer.dropEffect = 'move';
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('is-dnd-over');
    });

    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      btn.classList.remove('is-dnd-over');
      if (!_draggingGameId || !_lastUserGameOrderIds.length) return;
      const targetId = btn.dataset.gameId;
      if (!targetId || String(targetId) === String(_draggingGameId)) return;

      const from = _lastUserGameOrderIds.findIndex(id => String(id) === String(_draggingGameId));
      const to = _lastUserGameOrderIds.findIndex(id => String(id) === String(targetId));
      if (from < 0 || to < 0 || from === to) return;

      const newOrder = _moveIdInArray(_lastUserGameOrderIds, from, to);
      await dbReorderUserGames(newOrder);
      await refreshLibraryTabs();
    });
  });
}

function _attachSubTabsDnD() {
  const subTabs = document.getElementById('subTabs');
  if (!subTabs) return;
  const btns = [...subTabs.querySelectorAll('button[data-subtab-id]')];
  btns.forEach(b => b.setAttribute('draggable', 'true'));

  btns.forEach(btn => {
    const subTabId = btn.dataset.subtabId;
    if (!subTabId) return;

    btn.addEventListener('dragstart', (e) => {
      _draggingSubTabId = subTabId;
      btn.classList.add('is-dnd-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', subTabId); } catch { /* ignore */ }
    });

    btn.addEventListener('dragend', () => {
      _draggingSubTabId = null;
      btns.forEach(x => x.classList.remove('is-dnd-over', 'is-dnd-dragging'));
    });

    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('is-dnd-over');
      e.dataTransfer.dropEffect = 'move';
    });

    btn.addEventListener('dragleave', () => {
      btn.classList.remove('is-dnd-over');
    });

    btn.addEventListener('drop', async (e) => {
      e.preventDefault();
      btn.classList.remove('is-dnd-over');
      if (!_draggingSubTabId || !_lastUserSubTabOrderIds.length) return;
      const targetId = btn.dataset.subtabId;
      if (!targetId || String(targetId) === String(_draggingSubTabId)) return;

      const from = _lastUserSubTabOrderIds.findIndex(id => String(id) === String(_draggingSubTabId));
      const to = _lastUserSubTabOrderIds.findIndex(id => String(id) === String(targetId));
      if (from < 0 || to < 0 || from === to) return;

      const newOrder = _moveIdInArray(_lastUserSubTabOrderIds, from, to);
      await dbReorderUserSubTabs(app.activeUserGameId, newOrder);
      await refreshLibraryTabs();
    });
  });
}

async function renderSubTabs() {
  const subTabs = document.getElementById('subTabs');
  if (!subTabs) return;

  if (!app.activeUserGameId) {
    // Built-in child tabs
    subTabs.innerHTML = '';
    const cats = [
      { id: '8bit', label: '8BIT' },
      { id: 'real', label: 'REAL' },
      { id: 'ui', label: 'UI' },
      { id: 'env', label: 'ENV' }
    ];
    cats.forEach(c => {
      const active = app.currentCategory === c.id ? ` active-${c.id}` : '';
      subTabs.innerHTML += `
        <button class="cat-tab${active}" onclick="setCategory('${c.id}',this)">${c.label}</button>
      `;
    });
    return;
  }

  const game = await dbGetUserGame(app.activeUserGameId);
  const subtabs = game?.subtabs || [];
  const subtabsOrdered = [...subtabs].sort(_orderCmp);
  subTabs.innerHTML = '';
  if (!subtabsOrdered.length) {
    subTabs.innerHTML = `<div style="padding:8px;color:var(--text3);font-size:11px">No subtabs</div>`;
    return;
  }

  // Ensure active subtab exists
  const sidActive = app.activeUserSubTabId == null ? null : String(app.activeUserSubTabId);
  if (!sidActive || !subtabsOrdered.find(s => String(s.id) === sidActive)) {
    app.activeUserSubTabId = subtabsOrdered[0].id;
  }

  _lastUserSubTabOrderIds = subtabsOrdered.map(st => st.id);
  for (const st of subtabsOrdered) {
    const active = app.activeUserSubTabId != null && String(app.activeUserSubTabId) === String(st.id) ? ' active' : '';
    subTabs.innerHTML += `
      <button class="cat-tab${active}" draggable="true" data-subtab-id="${st.id}" onclick="selectUserSubTab(${JSON.stringify(st.id)},this)">${st.name}</button>
    `;
  }

  _attachSubTabsDnD();
}

export function selectBuiltInLibrary() {
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;

  const gameTabs = document.getElementById('gameTabs');
  if (gameTabs) {
    gameTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('gt-builtin')?.classList.add('active');
  }
  // Render built-in sub tabs + items
  renderPresets();
  void renderSubTabs();
  _renderLibraryActions();
}

export async function selectUserGame(gameId) {
  app.activeUserGameId = gameId;
  app.activeUserSubTabId = null;
  await refreshLibraryTabs();
}

export async function selectUserSubTab(subTabId) {
  app.activeUserSubTabId = subTabId;
  await refreshLibraryTabs();
}

function _renderLibraryActions() {
  const el = document.getElementById('libraryActions');
  if (!el) return;

  const disabled = !app.activeUserGameId;
  el.innerHTML = `
    <button
      class="btn-secondary library-actions-open-btn"
      style="font-size:11px; padding:10px 14px; width:100%;"
      onclick="openLibraryModal()"
      ${disabled ? 'disabled' : ''}
      title="${disabled ? 'Select a user game/subtab first' : 'Open library commands'}"
    >
      LIBRARY COMMANDS
    </button>
  `;
}

export async function addUserGame() {
  _syncAppSelectionFromModalIfOpen();
  const name = prompt('Game name?')?.trim();
  if (!name) return;
  await dbCreateUserGame(name);
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function deleteUserGame() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  const ok = confirm(`Delete game "${(await dbGetUserGame(app.activeUserGameId))?.name || ''}"?`);
  if (!ok) return;
  const gameId = app.activeUserGameId;
  await dbDeleteUserGame(gameId);
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function renameUserGame() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  const game = await dbGetUserGame(app.activeUserGameId);
  const name = prompt('Rename game:', game?.name)?.trim();
  if (!name) return;
  await dbRenameUserGame(app.activeUserGameId, name);
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function copyUserGame() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  const copied = await dbCopyUserGame(app.activeUserGameId);
  if (!copied) return;
  app.activeUserGameId = copied.id;
  app.activeUserSubTabId = (copied.subtabs && copied.subtabs[0]) ? copied.subtabs[0].id : null;
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function addUserSubTab() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  const name = prompt('Subtab name?')?.trim();
  if (!name) return;
  await dbCreateUserSubTab(app.activeUserGameId, name, []);
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function deleteUserSubTab() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  if (!app.activeUserSubTabId) return;
  const game = await dbGetUserGame(app.activeUserGameId);
  const st = game?.subtabs?.find(s => String(s.id) === String(app.activeUserSubTabId));
  const ok = confirm(`Delete subtab "${st?.name || ''}"?`);
  if (!ok) return;
  const subTabId = app.activeUserSubTabId;
  await dbDeleteUserSubTab(app.activeUserGameId, subTabId);
  app.activeUserSubTabId = null;
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function renameUserSubTab() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  if (!app.activeUserSubTabId) return;
  const game = await dbGetUserGame(app.activeUserGameId);
  const st = game?.subtabs?.find(s => String(s.id) === String(app.activeUserSubTabId));
  const name = prompt('Rename subtab:', st?.name)?.trim();
  if (!name) return;
  await dbRenameUserSubTab(app.activeUserGameId, app.activeUserSubTabId, name);
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

export async function copyUserSubTab() {
  _syncAppSelectionFromModalIfOpen();
  if (!app.activeUserGameId) { alert('Fixed library is read-only'); return; }
  if (!app.activeUserSubTabId) return;
  const copied = await dbCopyUserSubTab(app.activeUserGameId, app.activeUserSubTabId);
  if (!copied) return;
  // Select the copied subtab
  app.activeUserSubTabId = copied.id;
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

/**
 * state の内容をすべてのスライダー・ボタンに反映する（再生なし）。
 * セッション復元時に使用する。
 */
export function applyStateToUI() {
  const ids = ['attack', 'decay', 'release', 'frequency', 'sweep', 'cutoff', 'resonance', 'distortion', 'reverb', 'vibrato', 'duration'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = state[id];
      // updateParam は scheduleSessionSave を呼ぶが、saver 登録前なので無害
      updateParam(id, state[id]);
    }
  });

  const sustain = document.getElementById('sustain');
  if (sustain) {
    sustain.value = state.sustain * 100;
    updateParam('sustain', state.sustain * 100);
  }

  const waveNames = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));

  const filterEl = document.getElementById('filterType');
  if (filterEl && state.filterType) filterEl.value = state.filterType;

  syncVolumeSlider();
}

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

  // Sync sliders
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
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.toggle('active', b.textContent === waveNames[state.wave]));

  document.getElementById('presetInfoName').textContent = t('info.random');
  document.getElementById('presetInfoDesc').textContent = t('info.randomDesc');

  setTimeout(() => playSE(), 50);
}

// Re-render preset list when language changes
document.addEventListener('se:langchange', () => renderPresets());
