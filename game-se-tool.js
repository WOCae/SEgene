import { PRESETS } from './presets.js';

let audioCtx = null;
let analyser = null;
let gainNode = null;
let masterGain = null;
let rafId = null;
let currentCategory = '8bit';
let activePreset = null;

const state = {
  wave: 'square',
  attack: 10, decay: 100, sustain: 0.3, release: 200,
  frequency: 440, sweep: 0,
  cutoff: 8000, resonance: 1, filterType: 'lowpass',
  distortion: 0, reverb: 0, vibrato: 0,
  duration: 500,
  volume: 0.8
};


function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  masterGain = audioCtx.createGain();
  masterGain.gain.value = state.volume;
  masterGain.connect(analyser);
  analyser.connect(audioCtx.destination);
  drawWaveform();
}

function drawWaveform() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  const buf = new Uint8Array(analyser ? analyser.fftSize : 2048);

  function draw() {
    rafId = requestAnimationFrame(draw);
    ctx.clearRect(0, 0, W, H);
    if (analyser) analyser.getByteTimeDomainData(buf);
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#6c63ff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    const step = W / buf.length;
    for (let i = 0; i < buf.length; i++) {
      const v = analyser ? (buf[i] / 128) - 1 : 0;
      const y = (H / 2) + v * (H / 2 - 10);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * step, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // center line
    ctx.strokeStyle = 'rgba(108,99,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.stroke();
  }
  draw();
}

function makeNoise(ctx, duration) {
  const bufSize = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  return src;
}

function makeConvolver(ctx, reverbAmount) {
  const conv = ctx.createConvolver();
  const rate = ctx.sampleRate;
  const len = rate * 2;
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
  }
  conv.buffer = buf;
  const wet = ctx.createGain();
  wet.gain.value = reverbAmount / 100;
  conv.connect(wet);
  return { conv, wet };
}

function playSEOnCtx(ctx, dest, params) {
  const p = params || state;
  const now = Math.max(0, ctx.currentTime);
  const dur = Math.max(0.01, p.duration / 1000);
  const atkT = Math.max(0.001, p.attack / 1000);
  const decT = Math.max(0.001, p.decay / 1000);
  const relT = Math.max(0.001, p.release / 1000);
  // sustain phase must start at or after attack+decay, and before dur
  const susStart = Math.min(now + atkT + decT, now + dur - 0.001);
  const susEnd   = Math.max(susStart + 0.001, now + dur - relT);
  const endT     = Math.max(susEnd + 0.001, now + dur + relT);

  // Source
  let src;
  if (p.wave === 'noise') {
    src = makeNoise(ctx, dur + 0.5);
  } else {
    src = ctx.createOscillator();
    src.type = p.wave;
    src.frequency.setValueAtTime(p.frequency, now);
    if (p.sweep !== 0) {
      src.frequency.linearRampToValueAtTime(p.frequency + p.sweep, now + dur * 0.8);
    }
  }

  // Vibrato
  let vibratoGain;
  if (p.vibrato > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = p.vibrato;
    vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 15;
    lfo.connect(vibratoGain);
    if (p.wave !== 'noise') vibratoGain.connect(src.frequency);
    lfo.start(now);
    lfo.stop(endT);
  }

  // Filter
  const filter = ctx.createBiquadFilter();
  filter.type = p.filterType || 'lowpass';
  filter.frequency.value = p.cutoff;
  filter.Q.value = p.resonance;

  // Distortion
  const dist = ctx.createWaveShaper();
  if (p.distortion > 0) {
    const n = 256, curve = new Float32Array(n);
    const k = p.distortion;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    dist.curve = curve;
    dist.oversample = '4x';
  }

  // Gain (ADSR)
  const envGain = ctx.createGain();
  envGain.gain.setValueAtTime(0, now);
  envGain.gain.linearRampToValueAtTime(1, now + atkT);
  envGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, p.sustain)), susStart);
  envGain.gain.setValueAtTime(Math.max(0, Math.min(1, p.sustain)), susEnd);
  envGain.gain.linearRampToValueAtTime(0, endT);

  // Connect chain
  src.connect(filter);
  if (p.distortion > 0) { filter.connect(dist); dist.connect(envGain); }
  else { filter.connect(envGain); }

  if (p.reverb > 0) {
    const { conv, wet } = makeConvolver(ctx, p.reverb);
    const dry = ctx.createGain();
    dry.gain.value = 1 - p.reverb / 200;
    envGain.connect(dry);
    envGain.connect(conv);
    dry.connect(dest);
    wet.connect(dest);
  } else {
    envGain.connect(dest);
  }

  src.start(now);
  src.stop(endT + 0.05);
  return { src, dur: endT - now + 0.05 };
}

function playSE() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playSEOnCtx(audioCtx, masterGain, state);
}

async function exportWAV() {
  initAudio();
  const dur = state.duration / 1000 + state.release / 1000 + 0.3;
  const offCtx = new OfflineAudioContext(2, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const { src, dur: d } = playSEOnCtx(offCtx, offCtx.destination, state);
  const rendered = await offCtx.startRendering();
  const wav = encodeWAV(rendered);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (activePreset || 'se') + '.wav';
  a.click();
}

function encodeWAV(buffer) {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ab = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(ab);
  const wr = (off, s) => { for (let i=0;i<s.length;i++) view.setUint8(off+i,s.charCodeAt(i)); };
  wr(0,'RIFF'); view.setUint32(4,36+len*numCh*2,true);
  wr(8,'WAVE'); wr(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,numCh,true); view.setUint32(24,sr,true);
  view.setUint32(28,sr*numCh*2,true); view.setUint16(32,numCh*2,true);
  view.setUint16(34,16,true); wr(36,'data');
  view.setUint32(40,len*numCh*2,true);
  let off = 44;
  const ch = [];
  for (let c=0;c<numCh;c++) ch.push(buffer.getChannelData(c));
  for (let i=0;i<len;i++) {
    for (let c=0;c<numCh;c++) {
      const s = Math.max(-1,Math.min(1,ch[c][i]));
      view.setInt16(off, s<0?s*0x8000:s*0x7FFF, true);
      off+=2;
    }
  }
  return ab;
}

function updateParam(id, val) {
  const v = parseFloat(val);
  state[id] = id === 'sustain' ? v/100 : v;
  const labels = {
    attack: v+'ms', decay: v+'ms', sustain: (v/100).toFixed(2),
    release: v+'ms', frequency: v+'Hz', sweep: v+'Hz',
    cutoff: v+'Hz', resonance: parseFloat(v).toFixed(1),
    distortion: parseInt(v), reverb: v+'%', vibrato: v+'Hz',
    duration: (v/1000).toFixed(2)+'s'
  };
  const labelElIds = { frequency: 'vFreq', resonance: 'vRes', distortion: 'vDist' };
  const labelId = labelElIds[id] ?? ('v' + id.charAt(0).toUpperCase() + id.slice(1));
  const el = document.getElementById(labelId);
  if (el) el.textContent = labels[id] || v;
}

function syncVolumeSlider() {
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
}

function updateVolume(val) {
  state.volume = val/100;
  document.getElementById('vVol').textContent = val+'%';
  if (masterGain) masterGain.gain.value = val/100;
}

function updateFilter() {
  state.filterType = document.getElementById('filterType').value;
}

function setWave(type, btn) {
  state.wave = type;
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function setCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(b => {
    b.classList.remove('active-8bit','active-real','active-ui','active-env');
  });
  btn.classList.add('active-'+cat);
  renderPresets();
}

function renderPresets() {
  const list = document.getElementById('presetList');
  const presets = PRESETS[currentCategory] || [];
  list.innerHTML = presets.map((p,i) => `
    <button class="preset-btn" onclick="loadPreset('${currentCategory}',${i})" id="pb-${currentCategory}-${i}">
      <div class="preset-icon" style="background:${p.color}22;color:${p.color}">${p.icon}</div>
      <div class="preset-info">
        <div class="preset-name">${p.name}</div>
        <div class="preset-desc">${p.desc}</div>
      </div>
    </button>`).join('');
}

function loadPreset(cat, idx) {
  const p = PRESETS[cat][idx];
  activePreset = p.name;
  Object.assign(state, p.p);
  // Update UI
  const ids = ['attack','decay','release','frequency','sweep','cutoff','resonance','distortion','reverb','vibrato','duration'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = state[id]; updateParam(id, state[id]); }
  });
  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);
  syncVolumeSlider();
  // Wave button
  document.querySelectorAll('.wave-btn').forEach(b => {
    b.classList.toggle('active', b.textContent === p.p.wave.toUpperCase() ||
      (p.p.wave === 'noise' && b.textContent === 'NOISE') ||
      (p.p.wave === 'sawtooth' && b.textContent === 'SAW'));
  });
  state.wave = p.p.wave;
  // Highlight preset
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`pb-${cat}-${idx}`);
  if (btn) btn.classList.add('active');
  // Info
  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.desc;
  // Auto play
  setTimeout(() => playSE(), 50);
}

function randomize() {
  const waves = ['square','sine','sawtooth','triangle','noise'];
  state.wave = waves[Math.floor(Math.random()*waves.length)];
  state.frequency = Math.round(Math.random()*1800+80);
  state.attack = Math.round(Math.random()*200+1);
  state.decay = Math.round(Math.random()*500+50);
  state.sustain = Math.random()*0.7;
  state.release = Math.round(Math.random()*800+100);
  state.sweep = Math.round((Math.random()-0.5)*1000);
  state.cutoff = Math.round(Math.random()*15000+500);
  state.resonance = Math.round(Math.random()*100)/10;
  state.distortion = Math.round(Math.random()*150);
  state.reverb = Math.round(Math.random()*50);
  state.vibrato = Math.round(Math.random()*12*2)/2;
  state.duration = Math.round(Math.random()*1500+100);
  // Sync sliders
  const ids = ['attack','decay','release','frequency','sweep','cutoff','resonance','distortion','reverb','vibrato','duration'];
  ids.forEach(id => { const el=document.getElementById(id); if(el){el.value=state[id];updateParam(id,state[id]);}});
  document.getElementById('sustain').value = state.sustain*100;
  updateParam('sustain',state.sustain*100);
  const waveNames = {square:'SQUARE',sine:'SINE',sawtooth:'SAW',triangle:'TRI',noise:'NOISE'};
  document.querySelectorAll('.wave-btn').forEach(b=>b.classList.toggle('active',b.textContent===waveNames[state.wave]));
  document.getElementById('presetInfoName').textContent='ランダム';
  document.getElementById('presetInfoDesc').textContent='ランダム生成';
  setTimeout(()=>playSE(),50);
}

// ── SE Compare ───────────────────────────────────────────────
const CMP = {
  slots: [],      // { id, name, params, canvas, animId }
  maxSlots: 4,
  seqTimer: null,
};

const SLOT_COLORS = ['#6c63ff','#40c4aa','#ffb74d','#ff6b6b'];
const SLOT_LABELS = ['A','B','C','D'];

function cmpSnapshotState() {
  return JSON.parse(JSON.stringify(state));
}

function cmpAddSlot(params, name) {
  if (CMP.slots.length >= CMP.maxSlots) { showToast('スロットは最大4つです'); return; }
  const p = params || cmpSnapshotState();
  const id = Date.now() + Math.random();
  CMP.slots.push({ id, name: name || ('スロット ' + SLOT_LABELS[CMP.slots.length]), params: p, animId: null });
  cmpRender();
}

function cmpDeleteSlot(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (slot && slot.animId) cancelAnimationFrame(slot.animId);
  CMP.slots = CMP.slots.filter(s => s.id !== id);
  cmpRender();
}

function cmpCaptureSlot(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (!slot) return;
  slot.params = cmpSnapshotState();
  slot.name = activePreset || slot.name;
  cmpRender();
  showToast('「' + slot.name + '」に現在の設定をキャプチャしました');
}

function cmpLoadToEditor(id) {
  const slot = CMP.slots.find(s => s.id === id);
  if (!slot) return;
  Object.assign(state, slot.params);
  const ids = ['attack','decay','release','frequency','sweep','cutoff','resonance','distortion','reverb','vibrato','duration'];
  ids.forEach(k => { const el=document.getElementById(k); if(el){el.value=state[k];updateParam(k,state[k]);}});
  document.getElementById('sustain').value = state.sustain*100;
  updateParam('sustain',state.sustain*100);
  const wn = {square:'SQUARE',sine:'SINE',sawtooth:'SAW',triangle:'TRI',noise:'NOISE'};
  document.querySelectorAll('.wave-btn').forEach(b=>b.classList.toggle('active',b.textContent===wn[state.wave]));
  if (state.filterType) document.getElementById('filterType').value = state.filterType;
  syncVolumeSlider();
  document.getElementById('presetInfoName').textContent = slot.name;
  document.getElementById('presetInfoDesc').textContent = '比較スロットから読み込み';
  closeCompare();
  showToast('「' + slot.name + '」をエディタに読み込みました');
}

function cmpPlaySlot(id) {
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
    ctx.clearRect(0,0,W,H);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = W / buf.length;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] / 128) - 1;
      const y = H/2 + v*(H/2 - 4);
      i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i*step, y);
    }
    ctx.stroke();
    // center line
    ctx.strokeStyle = color + '33';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
  };
  draw();
}

function cmpPlayAll() {
  if (!CMP.slots.length) { showToast('スロットがありません'); return; }
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  CMP.slots.forEach(slot => {
    playSEOnCtx(audioCtx, masterGain, slot.params);
    cmpDrawWaveform(slot.id);
    const badge = document.getElementById(`cmp-badge-${slot.id}`);
    if (badge) {
      badge.classList.add('visible');
      setTimeout(() => badge.classList.remove('visible'), Math.min(slot.params.duration + slot.params.release + 200, 2000));
    }
  });
}

function cmpPlaySequential() {
  if (!CMP.slots.length) { showToast('スロットがありません'); return; }
  if (CMP.seqTimer) { clearTimeout(CMP.seqTimer); CMP.seqTimer = null; }
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  let delay = 0;
  CMP.slots.forEach(slot => {
    const d = delay;
    CMP.seqTimer = setTimeout(() => {
      playSEOnCtx(audioCtx, masterGain, slot.params);
      cmpDrawWaveform(slot.id);
      const badge = document.getElementById(`cmp-badge-${slot.id}`);
      if (badge) { badge.classList.add('visible'); setTimeout(() => badge.classList.remove('visible'), Math.min(slot.params.duration + slot.params.release + 200, 2000)); }
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
    const waveLabel = {square:'SQR',sine:'SIN',sawtooth:'SAW',triangle:'TRI',noise:'NSE'}[p.wave] || p.wave;

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
        <div class="cmp-param-mini"><div class="cmp-param-mini-label">DUR</div><div class="cmp-param-mini-val">${(p.duration/1000).toFixed(2)}s</div></div>
      </div>
      <div class="cmp-slot-actions">
        <button class="cmp-act-btn play-btn" onclick="cmpPlaySlot(${slot.id})">▶ 再生</button>
        <button class="cmp-act-btn capture-btn" onclick="cmpCaptureSlot(${slot.id})">⊙ キャプチャ</button>
        <button class="cmp-act-btn load-btn" onclick="cmpLoadToEditor(${slot.id})">↗ エディタへ</button>
        <button class="cmp-act-btn del-btn" onclick="cmpDeleteSlot(${slot.id})">✕</button>
      </div>`;
    body.appendChild(div);
  });

  // Empty slot placeholders up to 4
  if (CMP.slots.length < CMP.maxSlots) {
    const empty = document.createElement('div');
    empty.className = 'cmp-empty-slot';
    empty.onclick = () => cmpAddSlot();
    empty.innerHTML = `<div class="cmp-empty-icon">＋</div><div class="cmp-empty-label">現在の設定を追加</div>`;
    body.appendChild(empty);
  }
}

function openCompare() {
  // Auto-add current state if no slots yet
  if (CMP.slots.length === 0) cmpAddSlot(cmpSnapshotState(), activePreset || '現在の設定');
  cmpRender();
  document.getElementById('cmpOverlay').classList.add('open');
}

function closeCompare() {
  document.getElementById('cmpOverlay').classList.remove('open');
}

// ── Pitch Sequencer ──────────────────────────────────────────
const PSEQ = {
  bpm: 120,
  div: 8,
  len: 16,
  playing: false,
  currentStep: 0,
  intervalId: null,
  // steps[i] = { semitone: 0..N, muted: false }
  steps: Array.from({length:16}, () => ({ semitone: 0, muted: false })),
  scaleNotes: [],   // array of { hz, label } from low to high
  mutedSteps: new Set(),
};

const PSEQ_SCALES = {
  major:    [0,2,4,5,7,9,11],
  minor:    [0,2,3,5,7,8,10],
  penta:    [0,2,4,7,9],
  blues:    [0,3,5,6,7,10],
  chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],
};
const NOTE_NAMES2 = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToHz2(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function pseqRebuild() {
  const scale = PSEQ_SCALES[document.getElementById('pseqScale').value] || PSEQ_SCALES.major;
  const root  = parseInt(document.getElementById('pseqRoot').value);
  const oct   = parseInt(document.getElementById('pseqOct').value);
  const range = parseInt(document.getElementById('pseqRange').value);
  PSEQ.scaleNotes = [];
  for (let o = 0; o < range; o++) {
    for (const semi of scale) {
      const midi = root + semi + (oct + o) * 12;
      PSEQ.scaleNotes.push({ hz: midiToHz2(midi), label: NOTE_NAMES2[(root + semi) % 12] + (oct + o) });
    }
  }
  // Add one extra top note for visual completeness
  const topMidi = root + (oct + range) * 12;
  PSEQ.scaleNotes.push({ hz: midiToHz2(topMidi), label: NOTE_NAMES2[root % 12] + (oct + range) });
  pseqRenderGrid();
}

function pseqRenderGrid() {
  const container = document.getElementById('pseqGrid');
  container.innerHTML = '';
  const N = PSEQ.scaleNotes.length - 1; // usable index range 0..N

  for (let s = 0; s < PSEQ.len; s++) {
    const step = PSEQ.steps[s];
    // Clamp semitone to available range
    if (step.semitone > N) step.semitone = N;
    const fillPct = N > 0 ? (step.semitone / N) * 100 : 50;
    const note = PSEQ.scaleNotes[step.semitone];
    const isCurrent = s === PSEQ.currentStep && PSEQ.playing;
    const isMuted = PSEQ.mutedSteps.has(s);

    const lane = document.createElement('div');
    lane.className = 'pseq-lane' + (isCurrent ? ' active-step' : '') + (isMuted ? ' muted' : '');
    lane.id = `pseq-lane-${s}`;

    // Step number
    const num = document.createElement('div');
    num.className = 'pseq-step-num';
    num.textContent = s + 1;
    lane.appendChild(num);

    // Slider bar (drag to change pitch)
    const wrap = document.createElement('div');
    wrap.className = 'pseq-slider-wrap';

    const fill = document.createElement('div');
    fill.className = 'pseq-fill';
    fill.style.height = fillPct + '%';
    wrap.appendChild(fill);

    // Drag interaction
    let dragging = false;
    const onMove = (clientY) => {
      const rect = wrap.getBoundingClientRect();
      const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const idx = Math.round(ratio * N);
      PSEQ.steps[s].semitone = idx;
      fill.style.height = (N > 0 ? idx / N * 100 : 50) + '%';
      const n = PSEQ.scaleNotes[idx];
      label.textContent = n ? n.label : '';
    };
    wrap.addEventListener('mousedown', e => { dragging = true; onMove(e.clientY); e.preventDefault(); });
    wrap.addEventListener('touchstart', e => { dragging = true; onMove(e.touches[0].clientY); e.preventDefault(); }, {passive:false});
    document.addEventListener('mousemove', e => { if (dragging) onMove(e.clientY); });
    document.addEventListener('touchmove', e => { if (dragging) onMove(e.touches[0].clientY); }, {passive:true});
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('touchend', () => { dragging = false; });

    // Right-click to mute step
    wrap.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (PSEQ.mutedSteps.has(s)) PSEQ.mutedSteps.delete(s);
      else PSEQ.mutedSteps.add(s);
      lane.classList.toggle('muted', PSEQ.mutedSteps.has(s));
    });

    lane.appendChild(wrap);

    // Note label
    const label = document.createElement('div');
    label.className = 'pseq-note-label';
    label.textContent = note ? note.label : '';
    lane.appendChild(label);

    container.appendChild(lane);
  }
}

function pseqHighlightStep(step) {
  for (let s = 0; s < PSEQ.len; s++) {
    const lane = document.getElementById(`pseq-lane-${s}`);
    if (!lane) return; // grid not rendered yet
    lane.classList.toggle('active-step', s === step);
  }
}

function pseqTick() {
  const step = PSEQ.currentStep;
  pseqHighlightStep(step);

  if (!PSEQ.mutedSteps.has(step)) {
    const n = PSEQ.steps[step];
    const note = PSEQ.scaleNotes[n.semitone];
    if (note) {
      const noteDur = (60 / PSEQ.bpm) * (4 / PSEQ.div) * 1000 * 0.80;
      initAudio();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      playSEOnCtx(audioCtx, masterGain, { ...state, frequency: note.hz, duration: noteDur, sweep: 0 });
    }
  }
  PSEQ.currentStep = (step + 1) % PSEQ.len;
}

function pseqStart() {
  if (PSEQ.playing) return;
  initAudio();
  PSEQ.playing = true;
  PSEQ.currentStep = 0;
  document.getElementById('pseqStatus').textContent = 'PLAYING';
  document.getElementById('pseqStatus').classList.add('playing');
  const ms = (60 / PSEQ.bpm) * (4 / PSEQ.div) * 1000;
  pseqTick();
  PSEQ.intervalId = setInterval(pseqTick, ms);
}

function pseqStop() {
  if (!PSEQ.playing) return;
  clearInterval(PSEQ.intervalId);
  PSEQ.playing = false;
  PSEQ.currentStep = 0;
  document.getElementById('pseqStatus').textContent = 'STOPPED';
  document.getElementById('pseqStatus').classList.remove('playing');
  pseqHighlightStep(-1);
}

function pseqRestart() {
  if (!PSEQ.playing) return;
  clearInterval(PSEQ.intervalId);
  const ms = (60 / PSEQ.bpm) * (4 / PSEQ.div) * 1000;
  PSEQ.intervalId = setInterval(pseqTick, ms);
}

function pseqBpmChange(v) { PSEQ.bpm = parseInt(v); document.getElementById('vPseqBpm').textContent = v; pseqRestart(); }
function pseqDivChange() { PSEQ.div = parseInt(document.getElementById('pseqDiv').value); pseqRestart(); }

function pseqLenChange() {
  const was = PSEQ.playing;
  if (was) pseqStop();
  const newLen = parseInt(document.getElementById('pseqLen').value);
  while (PSEQ.steps.length < newLen) PSEQ.steps.push({ semitone: 0, muted: false });
  PSEQ.len = newLen;
  pseqRenderGrid();
  if (was) pseqStart();
}

function pseqQuick(type) {
  const N = PSEQ.scaleNotes.length - 1;
  if (type === 'scale-up') {
    for (let s = 0; s < PSEQ.len; s++) PSEQ.steps[s].semitone = Math.round((s / (PSEQ.len - 1)) * N);
  } else if (type === 'scale-down') {
    for (let s = 0; s < PSEQ.len; s++) PSEQ.steps[s].semitone = N - Math.round((s / (PSEQ.len - 1)) * N);
  } else if (type === 'rand') {
    for (let s = 0; s < PSEQ.len; s++) PSEQ.steps[s].semitone = Math.floor(Math.random() * (N + 1));
  } else if (type === 'flat') {
    const mid = Math.floor(N / 2);
    for (let s = 0; s < PSEQ.len; s++) PSEQ.steps[s].semitone = mid;
  }
  PSEQ.mutedSteps.clear();
  pseqRenderGrid();
}

function pseqToggleMute() {
  // Toggle mute on all steps (select odd steps for a rhythm feel)
  const allMuted = PSEQ.mutedSteps.size === PSEQ.len;
  PSEQ.mutedSteps.clear();
  if (!allMuted) for (let s = 1; s < PSEQ.len; s += 2) PSEQ.mutedSteps.add(s);
  pseqRenderGrid();
}

function togglePseq(on) {
  const panel = document.getElementById('pseqPanel');
  if (panel) panel.style.display = on ? 'block' : 'none';
  if (!on && PSEQ.playing) pseqStop();
}

function initPseq() {
  pseqRebuild();
  pseqQuick('scale-up');
}

// ── Arpeggiator ──────────────────────────────────────────────
const ARP = {
  bpm: 140,
  div: 8,
  steps: 16,
  playing: false,
  currentStep: 0,
  intervalId: null,
  grid: Array.from({length:4}, () => new Array(16).fill(false)),
  noteLabels: [],
  noteFreqs: [],
};

const SCALES = {
  major:    [0,2,4,5,7,9,11],
  minor:    [0,2,3,5,7,8,10],
  penta:    [0,2,4,7,9],
  blues:    [0,3,5,6,7,10],
  chromatic:[0,1,2,3,4,5,6,7,8,9,10,11],
  free:     [0,1,2,3,4,5,6,7,8,9,10,11],
};
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function midiToHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function arpRebuildNotes() {
  const scale = SCALES[document.getElementById('arpScale').value] || SCALES.major;
  const root  = parseInt(document.getElementById('arpRoot').value);
  const oct   = parseInt(document.getElementById('arpOct').value);
  const indices = [0,1,2,3].map(i => i % scale.length);
  ARP.noteFreqs  = indices.map(i => midiToHz(root + scale[i] + oct * 12));
  ARP.noteLabels = indices.map(i => NOTE_NAMES[(root + scale[i]) % 12] + oct);
  arpRenderGrid();
}

function arpRenderGrid() {
  const grid = document.getElementById('arpGrid');
  grid.innerHTML = '';
  const steps = ARP.steps;
  for (let r = 3; r >= 0; r--) {
    const label = document.createElement('div');
    label.className = 'arp-row-label';
    label.textContent = ARP.noteLabels[r] || ('R'+(r+1));
    grid.appendChild(label);
    const row = document.createElement('div');
    row.className = 'arp-steps';
    row.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;
    for (let s = 0; s < steps; s++) {
      const cell = document.createElement('div');
      cell.className = 'arp-step ' + (ARP.grid[r][s] ? 'note-on' : 'note-off');
      cell.dataset.row = r;
      cell.dataset.step = s;
      cell.onclick = () => { ARP.grid[r][s] = !ARP.grid[r][s]; cell.className = 'arp-step ' + (ARP.grid[r][s] ? 'note-on' : 'note-off'); cell.dataset.row = r; };
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
}

function arpStepInterval() {
  document.querySelectorAll('.arp-step.current').forEach(el => el.classList.remove('current'));
  const step = ARP.currentStep;
  document.querySelectorAll(`.arp-step[data-step="${step}"]`).forEach(el => el.classList.add('current'));
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  for (let r = 0; r < 4; r++) {
    if (ARP.grid[r][step]) {
      const freq = ARP.noteFreqs[r];
      const noteDur = (60 / ARP.bpm) * (4 / ARP.div) * 1000 * 0.82;
      playSEOnCtx(audioCtx, masterGain, { ...state, frequency: freq, duration: noteDur, sweep: 0 });
    }
  }
  ARP.currentStep = (step + 1) % ARP.steps;
}

function arpStart() {
  if (ARP.playing) return;
  initAudio();
  ARP.playing = true;
  ARP.currentStep = 0;
  document.getElementById('arpStatus').textContent = 'PLAYING';
  document.getElementById('arpStatus').classList.add('playing');
  const ms = (60 / ARP.bpm) * (4 / ARP.div) * 1000;
  arpStepInterval();
  ARP.intervalId = setInterval(arpStepInterval, ms);
}

function arpStop() {
  if (!ARP.playing) return;
  clearInterval(ARP.intervalId);
  ARP.playing = false;
  ARP.currentStep = 0;
  document.getElementById('arpStatus').textContent = 'STOPPED';
  document.getElementById('arpStatus').classList.remove('playing');
  document.querySelectorAll('.arp-step.current').forEach(el => el.classList.remove('current'));
}

function arpRestart() {
  if (!ARP.playing) return;
  clearInterval(ARP.intervalId);
  const ms = (60 / ARP.bpm) * (4 / ARP.div) * 1000;
  ARP.intervalId = setInterval(arpStepInterval, ms);
}

function arpBpmChange(val) { ARP.bpm = parseInt(val); document.getElementById('vArpBpm').textContent = val; arpRestart(); }
function arpDivChange() { ARP.div = parseInt(document.getElementById('arpDiv').value); arpRestart(); }

function arpStepsChange() {
  const was = ARP.playing;
  if (was) arpStop();
  ARP.steps = parseInt(document.getElementById('arpSteps').value);
  ARP.grid = ARP.grid.map(row => {
    const n = new Array(ARP.steps).fill(false);
    row.forEach((v,i) => { if (i < ARP.steps) n[i] = v; });
    return n;
  });
  arpRenderGrid();
  if (was) arpStart();
}

function arpPattern(type) {
  const steps = ARP.steps;
  ARP.grid = Array.from({length:4}, () => new Array(steps).fill(false));
  if (type === 'clear') { arpRenderGrid(); return; }
  if (type === 'up')    { for (let s=0;s<steps;s++) ARP.grid[s%4][s]=true; }
  else if (type === 'down')   { for (let s=0;s<steps;s++) ARP.grid[3-(s%4)][s]=true; }
  else if (type === 'updown') { const seq=[0,1,2,3,2,1]; for (let s=0;s<steps;s++) ARP.grid[seq[s%seq.length]][s]=true; }
  else if (type === 'rand')   { for (let s=0;s<steps;s++) ARP.grid[Math.floor(Math.random()*4)][s]=true; }
  arpRenderGrid();
}

function initArp() {
  arpRebuildNotes();
  arpPattern('up');
}

// ── JSON Preset Manager ──────────────────────────────────────
const STORAGE_KEY = 'gameSEUserPresets';

function getUserPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveUserPresets(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function saveCurrentPreset() {
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

function deleteUserPreset(id) {
  const list = getUserPresets().filter(p => p.id !== id);
  saveUserPresets(list);
  renderSavedPresets();
  showToast('削除しました');
}

function loadUserPreset(id) {
  const p = getUserPresets().find(p => p.id === id);
  if (!p) return;
  Object.assign(state, p.params);
  const ids = ['attack','decay','release','frequency','sweep','cutoff','resonance','distortion','reverb','vibrato','duration'];
  ids.forEach(id => { const el=document.getElementById(id); if(el){el.value=state[id];updateParam(id,state[id]);}});
  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);
  const waveNames = {square:'SQUARE',sine:'SINE',sawtooth:'SAW',triangle:'TRI',noise:'NOISE'};
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === waveNames[state.wave]));
  if (state.filterType) document.getElementById('filterType').value = state.filterType;
  syncVolumeSlider();
  document.getElementById('presetInfoName').textContent = p.name;
  document.getElementById('presetInfoDesc').textContent = p.savedAt + ' に保存';
  closeManager();
  showToast('「' + p.name + '」を読み込みました');
  setTimeout(() => playSE(), 80);
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
    </div>`).join('');
}

function exportAllJSON() {
  const list = getUserPresets();
  if (!list.length) { showToast('保存済みプリセットがありません'); return; }
  const blob = new Blob([JSON.stringify({ version:1, presets: list }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'game-se-presets.json';
  a.click();
  showToast(list.length + '件エクスポートしました');
}

function exportSingleJSON(id) {
  const p = getUserPresets().find(p => p.id === id);
  if (!p) return;
  const blob = new Blob([JSON.stringify({ version:1, presets:[p] }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = p.name.replace(/[^\w\u3040-\u9fff]/g,'_') + '.json';
  a.click();
}

function importJSON(event) {
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

function openManager() {
  renderSavedPresets();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('savePresetName').focus();
}

function closeManager() {
  document.getElementById('modalOverlay').classList.remove('open');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Temp Board ───────────────────────────────────────────────
const TB_KEY = 'gameSETempBoard';
const WAVE_SHORT = {square:'SQR',sine:'SIN',sawtooth:'SAW',triangle:'TRI',noise:'NSE'};

let tbCards = []; // [{ id, name, params, color }]
let tbDragId = null;
let tbDragOverId = null;
const TB_COLORS = ['#6c63ff','#40c4aa','#ffb74d','#ff6b6b','#39d98a','#f06292','#9c94ff','#80cbc4'];

function tbPersist() {
  try { localStorage.setItem(TB_KEY, JSON.stringify(tbCards)); } catch {}
}

function tbLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(TB_KEY) || '[]');
    tbCards = Array.isArray(d) ? d : [];
  } catch { tbCards = []; }
}

function tbAdd(params, name) {
  const p = params || JSON.parse(JSON.stringify(state));
  const n = name || activePreset || `SE ${tbCards.length + 1}`;
  const color = TB_COLORS[tbCards.length % TB_COLORS.length];
  tbCards.push({ id: Date.now() + Math.random(), name: n, params: p, color });
  tbPersist();
  tbRender();
  showToast(`「${n}」を一時保存しました`);
}

function tbDelete(id) {
  tbCards = tbCards.filter(c => c.id !== id);
  tbPersist();
  tbRender();
}

function tbClearAll() {
  if (!tbCards.length) return;
  tbCards = [];
  tbPersist();
  tbRender();
  showToast('一時保存を全消去しました');
}

function tbPlay(id) {
  const card = tbCards.find(c => c.id === id);
  if (!card) return;
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playSEOnCtx(audioCtx, masterGain, card.params);
  // Animate playing line
  const line = document.getElementById(`tb-line-${id}`);
  if (line) {
    line.style.transition = 'none';
    line.style.width = '0%';
    requestAnimationFrame(() => {
      const dur = Math.min(card.params.duration + card.params.release + 100, 3000);
      line.style.transition = `width ${dur}ms linear`;
      line.style.width = '100%';
      setTimeout(() => { line.style.transition = 'none'; line.style.width = '0%'; }, dur + 50);
    });
  }
}

function tbLoadToEditor(id) {
  const card = tbCards.find(c => c.id === id);
  if (!card) return;
  Object.assign(state, card.params);
  const ids = ['attack','decay','release','frequency','sweep','cutoff','resonance','distortion','reverb','vibrato','duration'];
  ids.forEach(k => { const el=document.getElementById(k); if(el){el.value=state[k];updateParam(k,state[k]);}});
  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);
  const wn = {square:'SQUARE',sine:'SINE',sawtooth:'SAW',triangle:'TRI',noise:'NOISE'};
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === wn[state.wave]));
  if (state.filterType) document.getElementById('filterType').value = state.filterType;
  syncVolumeSlider();
  document.getElementById('presetInfoName').textContent = card.name;
  document.getElementById('presetInfoDesc').textContent = 'Temp Boardから読み込み';
  showToast(`「${card.name}」をエディタに読み込みました`);
}

function tbRenameCard(id, newName) {
  const card = tbCards.find(c => c.id === id);
  if (card) { card.name = newName || card.name; tbPersist(); }
}

// Drag & Drop
function tbDragStart(id, e) {
  tbDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById(`tb-card-${id}`);
    if (el) el.classList.add('dragging');
  }, 0);
}
function tbDragEnd(id) {
  tbDragId = null;
  tbDragOverId = null;
  document.querySelectorAll('.tcard').forEach(el => el.classList.remove('dragging','drag-over'));
}
function tbDragOver(id, e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (id === tbDragId) return;
  if (id !== tbDragOverId) {
    document.querySelectorAll('.tcard').forEach(el => el.classList.remove('drag-over'));
    const el = document.getElementById(`tb-card-${id}`);
    if (el) el.classList.add('drag-over');
    tbDragOverId = id;
  }
}
function tbDrop(id, e) {
  e.preventDefault();
  if (!tbDragId || tbDragId === id) return;
  const fromIdx = tbCards.findIndex(c => c.id === tbDragId);
  const toIdx   = tbCards.findIndex(c => c.id === id);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = tbCards.splice(fromIdx, 1);
  tbCards.splice(toIdx, 0, moved);
  tbPersist();
  tbRender();
}

function tbRender() {
  const list = document.getElementById('tbList');
  if (!list) return;
  if (!tbCards.length) {
    list.innerHTML = '<div class="tboard-empty" onclick="tbAdd()">クリックして現在の設定を保存</div>';
    return;
  }
  list.innerHTML = tbCards.map(card => {
    const wl = WAVE_SHORT[card.params.wave] || card.params.wave;
    const freq = card.params.frequency;
    const dur = (card.params.duration / 1000).toFixed(2);
    const dist = card.params.distortion > 0 ? `dist:${card.params.distortion}` : '';
    const rvb  = card.params.reverb > 0 ? `rvb:${card.params.reverb}%` : '';
    const tags = [wl, `${freq}Hz`, `${dur}s`, dist, rvb].filter(Boolean);
    return `<div
      class="tcard"
      id="tb-card-${card.id}"
      draggable="true"
      ondragstart="tbDragStart(${card.id},event)"
      ondragend="tbDragEnd(${card.id})"
      ondragover="tbDragOver(${card.id},event)"
      ondrop="tbDrop(${card.id},event)"
    >
      <div class="tcard-playing-line" id="tb-line-${card.id}" style="background:${card.color}"></div>
      <div class="tcard-top">
        <span class="tcard-drag-handle" title="ドラッグして並べ替え">⠿</span>
        <span
          class="tcard-name"
          contenteditable="true"
          spellcheck="false"
          onblur="tbRenameCard(${card.id},this.textContent.trim())"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
        >${card.name}</span>
        <span class="tcard-wave" style="color:${card.color};border-color:${card.color}44;background:${card.color}18">${wl}</span>
      </div>
      <div class="tcard-tags">${tags.map(t=>`<span class="tcard-tag">${t}</span>`).join('')}</div>
      <div class="tcard-actions">
        <button class="tcard-btn play" onclick="tbPlay(${card.id})">▶ 再生</button>
        <button class="tcard-btn" onclick="tbLoadToEditor(${card.id})">↗ 編集</button>
        <button class="tcard-btn del" onclick="tbDelete(${card.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

function initTb() {
  tbLoad();
  tbRender();
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key==='Escape') { closeManager(); closeCompare(); if(ARP.playing) arpStop(); if(PSEQ.playing) pseqStop(); return; }
  if (e.target.tagName==='INPUT'||e.target.contentEditable==='true') return;
  if (e.code==='Space') { e.preventDefault(); ARP.playing ? arpStop() : (PSEQ.playing ? pseqStop() : playSE()); }
  if (e.key==='r'||e.key==='R') randomize();
  if (e.key==='s'||e.key==='S') openManager();
  if (e.key==='t'||e.key==='T') { tbAdd(); }
  if (e.key==='c'||e.key==='C') { cmpAddSlot(cmpSnapshotState(), activePreset||'設定'); showToast('比較スロットに追加しました'); }
  if (e.key==='a'||e.key==='A') ARP.playing ? arpStop() : arpStart();
  if (e.key==='p'||e.key==='P') {
    const cb = document.getElementById('pseqVisible');
    cb.checked = !cb.checked;
    togglePseq(cb.checked);
    if (cb.checked && !PSEQ.playing) pseqStart();
    else if (!cb.checked && PSEQ.playing) pseqStop();
  }
});

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
  tbRenameCard,
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

