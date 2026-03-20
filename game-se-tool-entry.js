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
const MOBILE_TAB_MQ = window.matchMedia('(max-width: 900px)');
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

// Init
renderPresets();
drawWaveform();
initArp();
initPseq();
initTb();
syncVolumeSlider();
requestAnimationFrame(() => syncVolumeSlider());

