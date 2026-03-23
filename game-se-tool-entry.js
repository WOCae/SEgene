import {
  loadPreset,
  setCategory,
  setWave,
  updateParam,
  updateVolume,
  updateFilter,
  randomize,
  syncVolumeSlider,
  applyStateToUI,
  layerSelect,
  layerAdd,
  layerRemove,
  layerMixChange,
  layerDelayChange,
  layerToggleMute
} from './se-editor-ui.js';
import {
  openLibraryModal,
  closeLibraryModal,
  applyLibraryModalSelection,
  initLibraryTabs,
  refreshLibraryTabs,
  toggleLibraryReorderMode,
  selectBuiltInLibrary,
  selectUserGame,
  selectUserSubTab,
  addUserGame,
  deleteUserGame,
  renameUserGame,
  copyUserGame,
  addUserSubTab,
  deleteUserSubTab,
  renameUserSubTab,
  copyUserSubTab
} from './se-library-ui.js';
import { drawWaveform, playSE, exportWAV, exportOGG, exportMP3, registerExportStopHandlers } from './se-audio-engine.js';
import {
  openManager,
  closeManager,
  saveCurrentPreset,
  saveParamsToLibrary,
  exportAllJSON,
  importJSON,
  loadUserPreset,
  deleteUserPreset,
  renameItemInActiveSubTab,
  renameUserItem,
  exportSubTabZip,
  exportGameZip
} from './se-json-manager.js';
import { openCompare, closeCompare, cmpPlayAll, cmpPlaySequential, cmpAddSlot, cmpPlaySlot, cmpCaptureSlot, cmpLoadToEditor, cmpDeleteSlot } from './se-compare.js';
import { ARP, arpBpmChange, arpDivChange, arpStepsChange, arpStart, arpStop, arpRebuildNotes, arpPattern, initArp } from './se-arp.js';
import { PSEQ, pseqBpmChange, pseqDivChange, pseqLenChange, pseqStart, pseqStop, pseqRebuild, pseqQuick, pseqToggleMute, togglePseq, initPseq } from './se-pseq.js';
import { tbAdd, tbClearAll, tbPlay, tbLoadToEditor, tbDelete, tbDragStart, tbDragEnd, tbDragOver, tbDrop, tbRenameCard, initTb } from './se-temp-board.js';
import { showToast } from './se-toast.js';
import { state, app, ensureLayers } from './se-state.js';
import { setSessionSaver, dbSaveSession, dbRestoreSession, migrateFromLocalStorage, scheduleSessionSave } from './se-db.js';
import { t, setLang, getLang, applyI18n } from './se-i18n.js';
import { openAiGenerator, closeAiGenerator, aiGenOnProviderChange, aiGenOnModelSelectChange, aiGenOnLayerModeChange, aiGenSetExample, aiGenGenerate, aiGenPreview, aiGenApply, aiGenRefreshModels, initAiGenerator } from './se-ai-generator.js';

// exportOGG 用: 録音中の混在を避けるために、必要なら ARP/PSEQ を停止
registerExportStopHandlers({
  stopArpIfPlaying: () => { if (ARP.playing) arpStop(); },
  stopPseqIfPlaying: () => { if (PSEQ.playing) pseqStop(); }
});

function openHelp() {
  closeManager();
  closeCompare();
  const overlay = document.getElementById('helpOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
}

function toggleLang() {
  setLang(getLang() === 'ja' ? 'en' : 'ja');
}

function closeHelp() {
  const overlay = document.getElementById('helpOverlay');
  overlay?.classList.remove('open');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeManager();
    closeCompare();
    closeHelp();
    closeAiGenerator();
    if (ARP.playing) arpStop();
    if (PSEQ.playing) pseqStop();
    return;
  }

  // モーダル表示中はキー操作を抑止（Esc のみ例外）
  if (document.getElementById('helpOverlay')?.classList.contains('open')) return;
  if (document.getElementById('aiGenOverlay')?.classList.contains('open')) return;

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;

  if (e.code === 'Space') {
    e.preventDefault();
    ARP.playing ? arpStop() : (PSEQ.playing ? pseqStop() : playSE());
  }

  if (e.key === 'r' || e.key === 'R') randomize();
  if (e.key === 's' || e.key === 'S') openManager();
  if (e.key === 't' || e.key === 'T') { tbAdd(); }

  if (e.key === 'c' || e.key === 'C') {
    cmpAddSlot(null, app.activePreset || t('info.defaultSetting'));
    showToast(t('toast.cmpAdded'));
  }

  if (e.key === 'a' || e.key === 'A') ARP.playing ? arpStop() : arpStart();

  if (e.key === 'p' || e.key === 'P') {
    const cb = document.getElementById('pseqVisible');
    cb.checked = !cb.checked;
    togglePseq(cb.checked);
    if (cb.checked && !PSEQ.playing) pseqStart();
    else if (!cb.checked && PSEQ.playing) pseqStop();
  }
});

// Public API for inline onclick (module のため window へ公開)
Object.assign(window, {
  openManager,
  closeManager,
  openCompare,
  closeCompare,
  openHelp,
  closeHelp,
  toggleLang,
  saveCurrentPreset,
  saveParamsToLibrary,
  exportAllJSON,
  importJSON,
  setCategory,
  selectBuiltInLibrary,
  selectUserGame,
  selectUserSubTab,
  addUserGame,
  deleteUserGame,
  renameUserGame,
  copyUserGame,
  addUserSubTab,
  deleteUserSubTab,
  renameUserSubTab,
  copyUserSubTab,
  openLibraryModal,
  closeLibraryModal,
  applyLibraryModalSelection,
  toggleLibraryReorderMode,
  setWave,
  updateParam,
  updateVolume,
  updateFilter,
  arpBpmChange,
  arpDivChange,
  arpStepsChange,
  arpStart,
  arpStop,
  arpRebuildNotes,
  arpPattern,
  pseqBpmChange,
  pseqDivChange,
  pseqLenChange,
  pseqStart,
  pseqStop,
  pseqRebuild,
  pseqQuick,
  pseqToggleMute,
  togglePseq,
  toggleAutoPlayOnEdit,
  toggleExportAtPlaybackVolume,
  layerSelect,
  layerAdd,
  layerRemove,
  layerMixChange,
  layerDelayChange,
  layerToggleMute,
  playSE,
  exportWAV,
  exportOGG,
  exportMP3,
  randomize,
  tbAdd,
  tbClearAll,
  cmpPlayAll,
  cmpPlaySequential,
  cmpAddSlot,
  cmpPlaySlot,
  cmpCaptureSlot,
  cmpLoadToEditor,
  cmpDeleteSlot,
  loadPreset,
  loadUserPreset,
  deleteUserPreset,
  tbPlay,
  tbLoadToEditor,
  tbDelete,
  tbDragStart,
  tbDragEnd,
  tbDragOver,
  tbDrop,
  tbRenameCard,
  renameItemInActiveSubTab,
  renameUserItem,
  exportSubTabZip,
  exportGameZip,
  openAiGenerator,
  closeAiGenerator,
  aiGenOnProviderChange,
  aiGenOnLayerModeChange,
  aiGenSetExample,
  aiGenGenerate,
  aiGenPreview,
  aiGenApply,
  aiGenRefreshModels,
  aiGenOnModelSelectChange,
});

// ---------- Auto play (edit sliders & presets) ----------
const EDIT_SLIDER_IDS = [
  'attack',
  'decay',
  'sustain',
  'release',
  'frequency',
  'sweep',
  'cutoff',
  'resonance',
  'distortion',
  'reverb',
  'vibrato',
  'duration',
];

let _editAutoTimer = null;
function scheduleEditorAutoPlay() {
  if (!state.autoPlayOnEdit) return;
  clearTimeout(_editAutoTimer);
  _editAutoTimer = setTimeout(() => {
    if (state.autoPlayOnEdit) playSE();
  }, 220); // "finished moving" debounce
}

function initAutoPlayOnEdit() {
  EDIT_SLIDER_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // `oninput="updateParam(...)"` already updates state; we only trigger playback when the user stops.
    el.addEventListener('input', scheduleEditorAutoPlay);
    el.addEventListener('change', scheduleEditorAutoPlay);
  });
}

function syncAutoPlayToggleUI() {
  const cb = document.getElementById('autoPlayOnEdit');
  if (!cb) return;
  cb.checked = !!state.autoPlayOnEdit;
}

function toggleAutoPlayOnEdit(checked) {
  state.autoPlayOnEdit = !!checked;
  if (!state.autoPlayOnEdit) clearTimeout(_editAutoTimer);
  scheduleSessionSave();
  syncAutoPlayToggleUI();
}

function syncExportAtPlaybackVolumeUI() {
  const cb = document.getElementById('exportAtPlaybackVolume');
  if (cb) cb.checked = !!state.exportAtPlaybackVolume;
}

function toggleExportAtPlaybackVolume(checked) {
  state.exportAtPlaybackVolume = !!checked;
  scheduleSessionSave();
}

initAutoPlayOnEdit();

// Keep MQ reference for panel resizer (disables drag on mobile)
const MOBILE_TAB_MQ = window.matchMedia('(max-width: 768px)');

// Mobile bottom sheets
function initMobileSheets() {
  const sidebar  = document.querySelector('.sidebar');
  const panel    = document.querySelector('.panel');
  const backdrop = document.getElementById('mobileSheetBackdrop');
  const triggers = {
    preset: document.getElementById('triggerPreset'),
    tools:  document.getElementById('triggerTools'),
  };
  if (!backdrop || !sidebar || !panel) return;

  const sheets = { preset: sidebar, tools: panel };
  let active = null;

  function openSheet(which) {
    if (active && active !== which) {
      sheets[active].classList.remove('sheet-open');
      triggers[active]?.classList.remove('is-active');
    }
    active = which;
    sheets[which].classList.add('sheet-open');
    triggers[which]?.classList.add('is-active');
    backdrop.classList.add('is-visible');
  }

  function closeSheet() {
    if (!active) return;
    sheets[active].classList.remove('sheet-open');
    triggers[active]?.classList.remove('is-active');
    active = null;
    backdrop.classList.remove('is-visible');
  }

  window.toggleMobileSheet = (which) => {
    active === which ? closeSheet() : openSheet(which);
  };

  backdrop.addEventListener('click', closeSheet);

  // Swipe down to close
  for (const sheet of Object.values(sheets)) {
    let startY = 0;
    sheet.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchend', (e) => {
      if (e.changedTouches[0].clientY - startY > 60) closeSheet();
    }, { passive: true });
  }
}

initMobileSheets();

// Panel resizers (drag horizontally)
function initPanelResizers() {
  const layout = document.getElementById('appLayout');
  const leftResizer = document.getElementById('leftResizer');
  const rightResizer = document.getElementById('rightResizer');

  if (!layout || !leftResizer || !rightResizer) return;

  const MIN_LEFT = 160;
  const MIN_RIGHT = 180;
  const MIN_CENTER = 240;

  const RESIZER_W = 8;

  const getCurrentVars = () => {
    const cols = getComputedStyle(layout).gridTemplateColumns.split(' ');
    const leftW = parseFloat(cols[0]) || 260;
    const rightW = parseFloat(cols[cols.length - 1]) || 280;
    return { leftW, rightW, resizerW: RESIZER_W };
  };

  const setVars = (leftW, rightW) => {
    layout.style.gridTemplateColumns = `${leftW}px ${RESIZER_W}px 1fr ${RESIZER_W}px ${rightW}px`;
  };

  let dragging = null;
  let activePointerId = null;
  let startX = 0;
  let startLeftW = 0;
  let startRightW = 0;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const onPointerMove = (e) => {
    if (!dragging || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const layoutW = layout.getBoundingClientRect().width;
    if (layoutW <= 0) return;

    if (dragging === 'left') {
      const maxLeft = layoutW - MIN_RIGHT - 2 * RESIZER_W - MIN_CENTER;
      const newLeft = clamp(startLeftW + dx, MIN_LEFT, maxLeft);
      setVars(newLeft, startRightW);
    } else {
      const maxRight = layoutW - MIN_LEFT - 2 * RESIZER_W - MIN_CENTER;
      const newRight = clamp(startRightW - dx, MIN_RIGHT, maxRight);
      setVars(startLeftW, newRight);
    }
  };

  const onPointerUp = (e) => {
    if (activePointerId !== e.pointerId) return;
    dragging = null;
    activePointerId = null;
    layout.classList.remove('is-resizing');
    document.body.style.cursor = '';
    scheduleSessionSave();
  };

  const startDrag = (which) => (e) => {
    if (MOBILE_TAB_MQ.matches) return;
    e.preventDefault();
    dragging = which;
    activePointerId = e.pointerId;
    startX = e.clientX;
    const { leftW, rightW } = getCurrentVars();
    startLeftW = leftW;
    startRightW = rightW;
    layout.classList.add('is-resizing');
    document.body.style.cursor = 'col-resize';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  leftResizer.addEventListener('pointerdown', startDrag('left'));
  rightResizer.addEventListener('pointerdown', startDrag('right'));
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

initPanelResizers();

// Theme switcher
const THEMES = [
  { id: 'indigo',       color: '#6c63ff', label: 'Indigo'       },
  { id: 'teal',         color: '#40c4aa', label: 'Teal'         },
  { id: 'amber',        color: '#ffb74d', label: 'Amber'        },
  { id: 'coral',        color: '#ff6b6b', label: 'Coral'        },
  { id: 'emerald',      color: '#39d98a', label: 'Emerald'      },
  { id: 'rose',         color: '#f06292', label: 'Rose'         },
  { id: 'mono',         color: '#aaaaaa', label: 'Mono'         },
  { id: 'pixel',        color: '#00ff41', label: 'Pixel',       pixel: true },
  { id: 'pixel-amber',  color: '#ffaa00', label: 'Pixel Amber', pixel: true },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('se-theme', id);
  document.querySelectorAll('.theme-swatch').forEach(el => {
    el.classList.toggle('is-active', el.dataset.themeId === id);
  });
}

function initTheme() {
  const container = document.getElementById('themeSwatches');
  if (container) {
    THEMES.forEach(({ id, color, label, pixel }) => {
      const btn = document.createElement('button');
      btn.className = 'theme-swatch' + (pixel ? ' is-pixel' : '');
      btn.dataset.themeId = id;
      btn.title = label;
      btn.style.background = color;
      btn.addEventListener('click', () => applyTheme(id));
      container.appendChild(btn);
    });
  }
  applyTheme(localStorage.getItem('se-theme') || 'indigo');
}

initTheme();

// ---------- Session: データ収集 ----------

function collectSession() {
  const layout = document.getElementById('appLayout');
  let leftW = 260, rightW = 280;
  if (layout) {
    const cols = getComputedStyle(layout).gridTemplateColumns.split(' ');
    leftW = parseFloat(cols[0]) || 260;
    rightW = parseFloat(cols[cols.length - 1]) || 280;
  }

  return {
    state: { ...state },
    currentCategory: app.currentCategory,
    activePreset: app.activePreset,
    activeUserGameId: app.activeUserGameId,
    activeUserSubTabId: app.activeUserSubTabId,
    panelCols: { leftW, rightW },
    arp: {
      bpm:   ARP.bpm,
      div:   ARP.div,
      steps: ARP.steps,
      grid:  ARP.grid.map(row => [...row]),
      scale: document.getElementById('arpScale')?.value  || 'major',
      root:  document.getElementById('arpRoot')?.value   || '69',
      oct:   document.getElementById('arpOct')?.value    || '4',
    },
    pseq: {
      bpm:        PSEQ.bpm,
      div:        PSEQ.div,
      len:        PSEQ.len,
      steps:      PSEQ.steps.map(s => ({ ...s })),
      mutedSteps: [...PSEQ.mutedSteps],
      scale: document.getElementById('pseqScale')?.value || 'major',
      root:  document.getElementById('pseqRoot')?.value  || '60',
      oct:   document.getElementById('pseqOct')?.value   || '4',
      range: document.getElementById('pseqRange')?.value || '2',
    },
  };
}

// ---------- Session: 復元 ----------

async function restoreSessionData(session) {
  // SE パラメータ
  if (session.state) {
    Object.assign(state, session.state);
    applyStateToUI();
  }

  // カテゴリ
  if (session.currentCategory) {
    app.currentCategory = session.currentCategory;
    app.activePreset = session.activePreset ?? null;

    // Restore user library selection (UI will be rebuilt by refreshLibraryTabs)
    app.activeUserGameId = session.activeUserGameId ?? null;
    app.activeUserSubTabId = session.activeUserSubTabId ?? null;

    // プリセット名表示
    if (session.activePreset) {
      const infoName = document.getElementById('presetInfoName');
      const infoDesc = document.getElementById('presetInfoDesc');
      if (infoName) infoName.textContent = session.activePreset;
      if (infoDesc) infoDesc.textContent = t('info.restoredSession');
    }
  }

  // パネル幅
  if (session.panelCols) {
    const layout = document.getElementById('appLayout');
    if (layout) {
      const { leftW, rightW } = session.panelCols;
      layout.style.gridTemplateColumns = `${leftW}px 8px 1fr 8px ${rightW}px`;
    }
  }

  // ARP
  if (session.arp) {
    const a = session.arp;
    if (a.bpm   != null) ARP.bpm   = a.bpm;
    if (a.div   != null) ARP.div   = a.div;
    if (a.steps != null) ARP.steps = a.steps;
    if (a.grid)          ARP.grid  = a.grid.map(row => [...row]);

    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    setVal('arpBpm',   a.bpm);
    setVal('arpDiv',   a.div);
    setVal('arpSteps', a.steps);
    setVal('arpScale', a.scale);
    setVal('arpRoot',  a.root);
    setVal('arpOct',   a.oct);
    const vBpm = document.getElementById('vArpBpm');
    if (vBpm) vBpm.textContent = ARP.bpm;
    arpRebuildNotes(); // DOM 値を読んでグリッド再描画
  }

  // PSEQ
  if (session.pseq) {
    const p = session.pseq;
    if (p.bpm  != null) PSEQ.bpm = p.bpm;
    if (p.div  != null) PSEQ.div = p.div;
    if (p.len  != null) PSEQ.len = p.len;
    if (p.steps)        PSEQ.steps = p.steps.map(s => ({ ...s }));
    if (p.mutedSteps)   PSEQ.mutedSteps = new Set(p.mutedSteps);

    const setVal = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    setVal('pseqBpm',   p.bpm);
    setVal('pseqDiv',   p.div);
    setVal('pseqLen',   p.len);
    setVal('pseqScale', p.scale);
    setVal('pseqRoot',  p.root);
    setVal('pseqOct',   p.oct);
    setVal('pseqRange', p.range);
    const vBpm = document.getElementById('vPseqBpm');
    if (vBpm) vBpm.textContent = PSEQ.bpm;
    pseqRebuild(); // DOM 値を読んでグリッド再描画
  }
}

// ---------- Init (async) ----------

(async () => {
  // 旧 localStorage データを IDB に移行（初回のみ）
  await migrateFromLocalStorage();

  // デフォルト状態で初期化
  await initLibraryTabs();
  initArp();
  initPseq();
  await initTb();
  initAiGenerator();

  // IDB からセッション復元（あれば上書き）
  const session = await dbRestoreSession();
  if (session) await restoreSessionData(session);
  else {
    ensureLayers();
    applyStateToUI();
  }
  // Rebuild library UI after session restore
  await refreshLibraryTabs();

  // Restore -> reflect toggle UIs
  syncAutoPlayToggleUI();
  syncExportAtPlaybackVolumeUI();

  drawWaveform();
  syncVolumeSlider();
  requestAnimationFrame(() => syncVolumeSlider());

  // Apply initial language translations
  applyI18n();
  document.documentElement.lang = getLang();

  // 復元完了後にセッションセーバーを登録（復元中の誤保存を防ぐ）
  setSessionSaver(() => dbSaveSession(collectSession()));

  // Temp Board → Library drag & drop
  const presetList = document.getElementById('presetList');
  if (presetList) {
    presetList.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('application/x-tbcard')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      presetList.classList.add('tb-drop-target');
    });
    presetList.addEventListener('dragleave', (ev) => {
      if (!presetList.contains(ev.relatedTarget)) presetList.classList.remove('tb-drop-target');
    });
    presetList.addEventListener('drop', async (e) => {
      presetList.classList.remove('tb-drop-target');
      const raw = e.dataTransfer.getData('application/x-tbcard');
      if (!raw) return;
      e.preventDefault();
      const { name, params } = JSON.parse(raw);
      await saveParamsToLibrary(name, params);
    });
  }
})();

