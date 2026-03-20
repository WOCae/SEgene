import { PRESETS } from './presets.js';
import { state, app } from './se-state.js';
import { masterGain, playSE } from './se-audio-engine.js';

export function updateParam(id, val) {
  const v = parseFloat(val);
  state[id] = id === 'sustain' ? v / 100 : v;

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
}

export function updateFilter() {
  state.filterType = document.getElementById('filterType').value;
}

export function setWave(type, btn) {
  state.wave = type;
  document.querySelectorAll('.wave-btn').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function setCategory(cat, btn) {
  app.currentCategory = cat;
  document.querySelectorAll('.cat-tab').forEach((b) => {
    b.classList.remove('active-8bit', 'active-real', 'active-ui', 'active-env');
  });
  if (btn) btn.classList.add('active-' + cat);
  renderPresets();
}

export function renderPresets() {
  const list = document.getElementById('presetList');
  const presets = PRESETS[app.currentCategory] || [];

  list.innerHTML = presets.map((p, i) => `
    <button class="preset-btn" onclick="loadPreset('${app.currentCategory}',${i})" id="pb-${app.currentCategory}-${i}">
      <div class="preset-icon" style="background:${p.color}22;color:${p.color}">${p.icon}</div>
      <div class="preset-info">
        <div class="preset-name">${p.name}</div>
        <div class="preset-desc">${p.desc}</div>
      </div>
    </button>
  `).join('');
}

export function loadPreset(cat, idx) {
  const p = PRESETS[cat][idx];
  app.activePreset = p.name;
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
  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.desc;

  // Auto play
  setTimeout(() => playSE(), 50);
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

  document.getElementById('presetInfoName').textContent = 'ランダム';
  document.getElementById('presetInfoDesc').textContent = 'ランダム生成';

  setTimeout(() => playSE(), 50);
}

