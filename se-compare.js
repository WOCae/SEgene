import { state, app } from './se-state.js';
import { initAudio, audioCtx, analyser, masterGain, playSEOnCtx } from './se-audio-engine.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider } from './se-editor-ui.js';
import { t } from './se-i18n.js';

export const CMP = {
  slots: [],
  maxSlots: 4,
  seqTimer: null
};

const SLOT_COLORS = ['#6c63ff', '#40c4aa', '#ffb74d', '#ff6b6b'];
const SLOT_LABELS = ['A', 'B', 'C', 'D'];

function cmpSnapshotState() {
  return JSON.parse(JSON.stringify(state));
}

export function cmpAddSlot(params, name) {
  if (CMP.slots.length >= CMP.maxSlots) { showToast(t('toast.maxSlots')); return; }
  const p = params || cmpSnapshotState();
  const id = Date.now() + Math.random();
  CMP.slots.push({ id, name: name || t('cmp.slot', SLOT_LABELS[CMP.slots.length]), params: p, animId: null });
  cmpRender();
}

export function cmpDeleteSlot(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (slot && slot.animId) cancelAnimationFrame(slot.animId);
  CMP.slots = CMP.slots.filter(s => s.id !== id);
  cmpRender();
}

export function cmpCaptureSlot(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (!slot) return;
  slot.params = cmpSnapshotState();
  slot.name = app.activePreset || slot.name;
  cmpRender();
}

export function cmpLoadToEditor(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (!slot) return;

  Object.assign(state, slot.params);

  const ids = ['attack', 'decay', 'release', 'frequency', 'sweep', 'cutoff', 'resonance', 'distortion', 'reverb', 'vibrato', 'duration'];
  ids.forEach((k) => {
    const el = document.getElementById(k);
    if (el) { el.value = state[k]; updateParam(k, state[k]); }
  });

  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);

  const wn = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.toggle('active', b.textContent === wn[state.wave]));
  if (state.filterType) document.getElementById('filterType').value = state.filterType;

  syncVolumeSlider();

  document.getElementById('presetInfoName').textContent = slot.name;
  document.getElementById('presetInfoDesc').textContent = t('info.fromCmp');
  closeCompare();
  showToast(t('toast.loadedToEditor', slot.name));
}

export function cmpPlaySlot(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (!slot) return;

  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playSEOnCtx(audioCtx, masterGain, slot.params);

  // Flash badge
  const badge = document.getElementById(`cmp-badge-${id}`);
  if (badge) {
    badge.classList.add('visible');
    setTimeout(() => badge.classList.remove('visible'), Math.min(slot.params.duration + slot.params.release + 200, 2000));
  }

  // Draw waveform once
  cmpDrawWaveform(id);
}

function cmpDrawWaveform(slotId) {
  const canvas = document.getElementById(`cmp-canvas-${slotId}`);
  if (!canvas || !analyser) return;

  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
  canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  const slot = CMP.slots.find(s => s.id === slotId);
  const color = slot ? SLOT_COLORS[CMP.slots.indexOf(slot) % SLOT_COLORS.length] : '#6c63ff';
  const buf = new Uint8Array(analyser.fftSize);

  let frames = 0;
  const draw = () => {
    frames++;
    if (frames > 120) return; // stop after ~2s
    if (slot) slot.animId = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = W / buf.length;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] / 128) - 1;
      const y = H / 2 + v * (H / 2 - 4);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * step, y);
    }
    ctx.stroke();
    // center line
    ctx.strokeStyle = color + '33';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  };

  draw();
}

export function cmpPlayAll() {
  if (!CMP.slots.length) { showToast(t('toast.noSlots')); return; }
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  CMP.slots.forEach((slot) => {
    playSEOnCtx(audioCtx, masterGain, slot.params);
    cmpDrawWaveform(slot.id);
    const badge = document.getElementById(`cmp-badge-${slot.id}`);
    if (badge) {
      badge.classList.add('visible');
      setTimeout(() => badge.classList.remove('visible'), Math.min(slot.params.duration + slot.params.release + 200, 2000));
    }
  });
}

export function cmpPlaySequential() {
  if (!CMP.slots.length) { showToast(t('toast.noSlots')); return; }
  if (CMP.seqTimer) { clearTimeout(CMP.seqTimer); CMP.seqTimer = null; }

  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  let delay = 0;
  CMP.slots.forEach((slot) => {
    const d = delay;
    CMP.seqTimer = setTimeout(() => {
      playSEOnCtx(audioCtx, masterGain, slot.params);
      cmpDrawWaveform(slot.id);
      const badge = document.getElementById(`cmp-badge-${slot.id}`);
      if (badge) {
        badge.classList.add('visible');
        setTimeout(() => badge.classList.remove('visible'), Math.min(slot.params.duration + slot.params.release + 200, 2000));
      }
    }, d);

    delay += Math.min(slot.params.duration + slot.params.release + 300, 2500);
  });
}

function cmpRender() {
  const body = document.getElementById('cmpBody');
  if (!body) return;

  body.innerHTML = '';

  CMP.slots.forEach((slot, i) => {
    const color = SLOT_COLORS[i % SLOT_COLORS.length];
    const label = SLOT_LABELS[i];
    const p = slot.params;
    const waveLabel = { square: 'SQR', sine: 'SIN', sawtooth: 'SAW', triangle: 'TRI', noise: 'NSE' }[p.wave] || p.wave;

    const div = document.createElement('div');
    div.className = 'cmp-slot';
    div.style.borderTopColor = color;
    div.style.borderTopWidth = '3px';
    div.innerHTML = `
      <span class="cmp-playing-badge" id="cmp-badge-${slot.id}">▶ PLAYING</span>
      <div class="cmp-slot-header">
        <span class="cmp-slot-num" style="color:${color};border-color:${color}44;background:${color}18">${label}</span>
        <span class="cmp-slot-name">${slot.name}</span>
        <span class="cmp-slot-wave">${waveLabel}</span>
      </div>
      <canvas class="cmp-waveform" id="cmp-canvas-${slot.id}"></canvas>
      <div class="cmp-params-mini">
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">FREQ</div><div class="cmp-param-mini-val">${p.frequency}Hz</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">ATK</div><div class="cmp-param-mini-val">${p.attack}ms</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">DEC</div><div class="cmp-param-mini-val">${p.decay}ms</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">SUS</div><div class="cmp-param-mini-val">${p.sustain.toFixed(2)}</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">REL</div><div class="cmp-param-mini-val">${p.release}ms</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">DIST</div><div class="cmp-param-mini-val">${p.distortion}</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">RVB</div><div class="cmp-param-mini-val">${p.reverb}%</div></div>
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">DUR</div><div class="cmp-param-mini-val">${(p.duration / 1000).toFixed(2)}s</div></div>
      </div>
      <div class="cmp-slot-actions">
        <button class="cmp-act-btn play-btn" onclick="cmpPlaySlot(${slot.id})">${t('cmp.playBtn')}</button>
        <button class="cmp-act-btn capture-btn" onclick="cmpCaptureSlot(${slot.id})">${t('cmp.captureBtn')}</button>
        <button class="cmp-act-btn load-btn" onclick="cmpLoadToEditor(${slot.id})">${t('cmp.loadBtn')}</button>
        <button class="cmp-act-btn del-btn" onclick="cmpDeleteSlot(${slot.id})">✕</button>
      </div>`;
    body.appendChild(div);
  });

  // Empty slot placeholders up to 4
  if (CMP.slots.length < CMP.maxSlots) {
    const empty = document.createElement('div');
    empty.className = 'cmp-empty-slot';
    empty.onclick = () => cmpAddSlot();
    empty.innerHTML = `<div class="cmp-empty-icon">＋</div><div class="cmp-empty-label">${t('cmp.emptyAdd')}</div>`;
    body.appendChild(empty);
  }
}

export function openCompare() {
  // Auto-add current state if no slots yet
  if (CMP.slots.length === 0) cmpAddSlot(cmpSnapshotState(), app.activePreset || t('cmp.currentSettings'));
  cmpRender();
  document.getElementById('cmpOverlay').classList.add('open');
}

export function closeCompare() {
  document.getElementById('cmpOverlay').classList.remove('open');
}

// Re-render slot buttons when language changes
document.addEventListener('se:langchange', () => {
  if (document.getElementById('cmpOverlay')?.classList.contains('open')) cmpRender();
});

