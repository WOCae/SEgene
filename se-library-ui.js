// se-library-ui.js — Library Management UI (game → subtab → items hierarchy)
// Handles: openLibraryModal, refreshLibraryTabs, game/subtab CRUD, drag&drop reorder

import { app } from './se-state.js';
import { renderPresets } from './se-editor-ui.js';
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
import { getLang, t } from './se-i18n.js';

let _draggingGameId = null;
let _draggingSubTabId = null;

// innerHTML += ループによるDOM再パースを防ぐためのユーティリティ
function _escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
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
  app.activeUserGameId = m.gameVal && m.gameVal !== '__builtin__' ? m.gameVal : null;
  app.activeUserSubTabId = m.gameVal && m.gameVal !== '__builtin__' ? (m.subVal || null) : null;
  return true;
}

async function _syncLibraryModalFromApp() {
  if (!_isLibraryModalOpen()) return;
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
    selSub.value = selSub.options[0].value;
  } else if (!selGame.value || selGame.value === '__builtin__') {
    selSub.value = app.currentCategory || selSub.options[0]?.value || '';
  }
}

async function _fillLibraryModalGameSelect() {
  const sel = document.getElementById('libraryGameSelect');
  if (!sel) return;
  const games = await dbGetUserGames();
  const parts = ['<option value="__builtin__">PRESETS (Fixed library)</option>'];
  for (const g of games) {
    parts.push(`<option value="${_escHtml(g.id)}">${_escHtml(g.name)}</option>`);
  }
  sel.innerHTML = parts.join('');
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
    sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
    return;
  }

  const game = await dbGetUserGame(gameVal);
  const subtabs = game?.subtabs || [];
  if (!subtabs.length) {
    sel.innerHTML = `<option value="">(No subtabs)</option>`;
    return;
  }
  sel.innerHTML = subtabs.map(st => `<option value="${_escHtml(st.id)}">${_escHtml(st.name)}</option>`).join('');
}

export async function openLibraryModal() {
  const overlay = document.getElementById('libraryModalOverlay');
  if (!overlay) return;

  try {
    await _fillLibraryModalGameSelect();

    const selGame = document.getElementById('libraryGameSelect');
    if (selGame) {
      if (app.activeUserGameId) selGame.value = app.activeUserGameId;
      else selGame.value = '__builtin__';
    }

    if (selGame && !selGame.dataset._subtabListenerAttached) {
      selGame.addEventListener('change', async () => {
        await _fillLibraryModalSubTabSelect();
        const selSub = document.getElementById('librarySubTabSelect');
        if (selSub && selSub.options.length) {
          const desired = app.activeUserSubTabId;
          const opt = desired ? [...selSub.options].find(o => o.value === String(desired)) : null;
          selSub.value = opt ? desired : (selSub.options[0]?.value || '');
        }
        document.dispatchEvent(new Event('se:libmodaltabchange'));
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

      if (!selSub.dataset._subtabChangeListenerAttached) {
        selSub.addEventListener('change', () => {
          document.dispatchEvent(new Event('se:libmodaltabchange'));
        });
        selSub.dataset._subtabChangeListenerAttached = '1';
      }
    }

    overlay.classList.add('open');
    document.dispatchEvent(new Event('se:libmodaltabchange'));
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

export async function initLibraryTabs() {
  await refreshLibraryTabs();
}

export async function refreshLibraryTabs() {
  const gameTabs = document.getElementById('gameTabs');
  const subTabs = document.getElementById('subTabs');
  if (!gameTabs || !subTabs) return;

  const games = await dbGetUserGames();
  gameTabs.innerHTML = '';

  const builtInActive = app.activeUserGameId ? '' : ' active';
  games.sort(_orderCmp);
  _lastUserGameOrderIds = games.map(g => g.id);

  const gameTabParts = [
    `<button class="cat-tab${builtInActive}" onclick="selectBuiltInLibrary(this)" id="gt-builtin">PRESETS</button>`
  ];
  for (const g of games) {
    const active = app.activeUserGameId != null && String(app.activeUserGameId) === String(g.id) ? ' active' : '';
    gameTabParts.push(`<button class="cat-tab${active}" onclick="selectUserGame(${JSON.stringify(g.id)},this)" data-game-id="${_escHtml(g.id)}">${_escHtml(g.name)}</button>`);
  }
  gameTabParts.push(`<button class="cat-tab library-add-game-tab" onclick="addUserGame()" title="Add game">＋ Game</button>`);
  gameTabs.innerHTML = gameTabParts.join('\n  ');

  if (app.activeUserGameId) {
    const game = games.find(x => x.id === app.activeUserGameId) || await dbGetUserGame(app.activeUserGameId);
    if (!game) {
      app.activeUserGameId = null;
      app.activeUserSubTabId = null;
    }
    if (game && !(game.subtabs || []).length) {
      app.activeUserSubTabId = null;
    }
  }

  await renderSubTabs();
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
  btns.forEach(b => b.setAttribute('draggable', 'true'));

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
    subTabs.innerHTML = '';
    const cats = [
      { id: '8bit', label: '8BIT' },
      { id: 'real', label: 'REAL' },
      { id: 'ui', label: 'UI' },
      { id: 'env', label: 'ENV' }
    ];
    subTabs.innerHTML = cats.map(c => {
      const active = app.currentCategory === c.id ? ` active-${c.id}` : '';
      return `<button class="cat-tab${active}" onclick="setCategory('${c.id}',this)">${c.label}</button>`;
    }).join('\n    ');
    return;
  }

  const game = await dbGetUserGame(app.activeUserGameId);
  const subtabs = game?.subtabs || [];
  const subtabsOrdered = [...subtabs].sort(_orderCmp);
  subTabs.innerHTML = '';
  if (!subtabsOrdered.length) {
    subTabs.innerHTML = `<div style="padding:8px;color:var(--text3);font-size:11px">No subtabs</div><button class="cat-tab library-add-subtab-tab" onclick="addUserSubTab()" title="Add subtab">＋ Subtab</button>`;
    return;
  }

  const sidActive = app.activeUserSubTabId == null ? null : String(app.activeUserSubTabId);
  if (!sidActive || !subtabsOrdered.find(s => String(s.id) === sidActive)) {
    app.activeUserSubTabId = subtabsOrdered[0].id;
  }

  _lastUserSubTabOrderIds = subtabsOrdered.map(st => st.id);
  const subTabParts = subtabsOrdered.map(st => {
    const active = app.activeUserSubTabId != null && String(app.activeUserSubTabId) === String(st.id) ? ' active' : '';
    return `<button class="cat-tab${active}" draggable="true" data-subtab-id="${_escHtml(st.id)}" onclick="selectUserSubTab(${JSON.stringify(st.id)},this)">${_escHtml(st.name)}</button>`;
  });
  subTabParts.push(`<button class="cat-tab library-add-subtab-tab" onclick="addUserSubTab()" title="Add subtab">＋ Subtab</button>`);
  subTabs.innerHTML = subTabParts.join('\n  ');

  _attachSubTabsDnD();
}

function _renderLibraryActions() {
  const el = document.getElementById('libraryActions');
  if (!el) return;

  const showReorder = !!(app.activeUserGameId && app.activeUserSubTabId);
  const reorderLabel = app.libraryReorderMode ? t('library.reorderDone') : t('library.reorderBtn');

  el.innerHTML = `
    <button
      class="btn-secondary library-actions-open-btn"
      style="font-size:11px; padding:10px 14px; width:100%;"
      onclick="openLibraryModal()"
      title="Open library commands"
    >
      LIBRARY COMMANDS
    </button>
    ${showReorder ? `
    <button
      type="button"
      class="btn-secondary library-reorder-toggle-btn"
      style="font-size:11px; padding:8px 10px; width:100%;"
      onclick="toggleLibraryReorderMode()"
      title="${reorderLabel}"
    >${reorderLabel}</button>
    ` : ''}
  `;
}

export function toggleLibraryReorderMode() {
  app.libraryReorderMode = !app.libraryReorderMode;
  renderPresets();
  _renderLibraryActions();
}

export function selectBuiltInLibrary() {
  app.activeUserGameId = null;
  app.activeUserSubTabId = null;
  app.libraryReorderMode = false;

  const gameTabs = document.getElementById('gameTabs');
  if (gameTabs) {
    gameTabs.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('gt-builtin')?.classList.add('active');
  }
  renderPresets();
  void renderSubTabs();
  _renderLibraryActions();
}

export async function selectUserGame(gameId) {
  app.libraryReorderMode = false;
  app.activeUserGameId = gameId;
  app.activeUserSubTabId = null;
  await refreshLibraryTabs();
}

export async function selectUserSubTab(subTabId) {
  app.libraryReorderMode = false;
  app.activeUserSubTabId = subTabId;
  await refreshLibraryTabs();
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
  app.activeUserSubTabId = copied.id;
  await refreshLibraryTabs();
  await _syncLibraryModalFromApp();
}

document.addEventListener('se:langchange', () => {
  _renderLibraryActions();
});
