import { renderPresets, loadPreset, setCategory, setWave, updateParam, updateVolume, updateFilter, randomize, syncVolumeSlider } from './se-editor-ui.js';
import { drawWaveform, playSE, exportWAV, exportOGG, registerExportStopHandlers } from './se-audio-engine.js';
import { openManager, closeManager, saveCurrentPreset, exportAllJSON, exportSingleJSON, importJSON, loadUserPreset, deleteUserPreset } from './se-json-manager.js';
import { openCompare, closeCompare, cmpPlayAll, cmpPlaySequential, cmpAddSlot, cmpPlaySlot, cmpCaptureSlot, cmpLoadToEditor, cmpDeleteSlot } from './se-compare.js';
import { ARP, arpBpmChange, arpDivChange, arpStepsChange, arpStart, arpStop, arpRebuildNotes, arpPattern, initArp } from './se-arp.js';
import { PSEQ, pseqBpmChange, pseqDivChange, pseqLenChange, pseqStart, pseqStop, pseqRebuild, pseqQuick, pseqToggleMute, togglePseq, initPseq } from './se-pseq.js';
import { tbAdd, tbClearAll, tbPlay, tbLoadToEditor, tbDelete, tbDragStart, tbDragEnd, tbDragOver, tbDrop, tbRenameCard, initTb } from './se-temp-board.js';
import { showToast } from './se-toast.js';
import { app } from './se-state.js';

// exportOGG 用: 録音中の混在を避けるために、必要なら ARP/PSEQ を停止
registerExportStopHandlers({
  stopArpIfPlaying: () => { if (ARP.playing) arpStop(); },
  stopPseqIfPlaying: () => { if (PSEQ.playing) pseqStop(); }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeManager();
    closeCompare();
    if (ARP.playing) arpStop();
    if (PSEQ.playing) pseqStop();
    return;
  }

  if (e.target.tagName === 'INPUT' || e.target.contentEditable === 'true') return;

  if (e.code === 'Space') {
    e.preventDefault();
    ARP.playing ? arpStop() : (PSEQ.playing ? pseqStop() : playSE());
  }

  if (e.key === 'r' || e.key === 'R') randomize();
  if (e.key === 's' || e.key === 'S') openManager();
  if (e.key === 't' || e.key === 'T') { tbAdd(); }

  if (e.key === 'c' || e.key === 'C') {
    cmpAddSlot(null, app.activePreset || '設定');
    showToast('比較スロットに追加しました');
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
  saveCurrentPreset,
  exportAllJSON,
  importJSON,
  setCategory,
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
  playSE,
  exportWAV,
  exportOGG,
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
  exportSingleJSON,
  deleteUserPreset,
  tbPlay,
  tbLoadToEditor,
  tbDelete,
  tbDragStart,
  tbDragEnd,
  tbDragOver,
  tbDrop,
  tbRenameCard
});

// Mobile layout tabs (narrow viewport)
// 800x600 でも標準（3カラム）表示に寄せるため、閾値を下げる
const MOBILE_TAB_MQ = window.matchMedia('(max-width: 768px)');
const appLayout = document.getElementById('appLayout');
const mobileTabbar = document.getElementById('mobileTabbar');

function setMobileTab(tab) {
  if (!appLayout || !mobileTabbar) return;
  appLayout.dataset.mobileTab = tab;
  mobileTabbar.querySelectorAll('.mobile-tab').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function syncMobileTabUI() {
  if (!appLayout || !mobileTabbar) return;
  if (MOBILE_TAB_MQ.matches) {
    if (!appLayout.dataset.mobileTab) appLayout.dataset.mobileTab = 'presets';
    setMobileTab(appLayout.dataset.mobileTab);
    mobileTabbar.setAttribute('aria-hidden', 'false');
  } else {
    mobileTabbar.querySelectorAll('.mobile-tab').forEach((btn) => {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-selected', 'false');
    });
    mobileTabbar.setAttribute('aria-hidden', 'true');
  }
}

mobileTabbar?.addEventListener('click', (e) => {
  const btn = e.target.closest('.mobile-tab');
  if (!btn?.dataset.tab) return;
  setMobileTab(btn.dataset.tab);
});

MOBILE_TAB_MQ.addEventListener('change', syncMobileTabUI);
syncMobileTabUI();

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

// Init
renderPresets();
drawWaveform();
initArp();
initPseq();
initTb();
syncVolumeSlider();
requestAnimationFrame(() => syncVolumeSlider());

