import {
  state, app, ensureLayers, pushActiveToLayers, pickSynthFromState
} from './se-state.js';
import { showToast } from './se-toast.js';
import { t } from './se-i18n.js';

let audioCtx = null;
let analyser = null;
let masterGain = null;
let rafId = null;

// キャンバスキャッシュ（毎フレームのreflowを防ぐため1回だけセットアップ）
let _canvas = null;
let _canvasCtx = null;
let _canvasW = 0;
let _canvasH = 0;
let _canvasDPR = 1;
let _silentFrames = 0;
const SILENT_FRAMES_THRESHOLD = 90; // ~1.5秒(60fps)で無音とみなしRAFを停止

function _setupCanvas() {
  _canvas = document.getElementById('canvas');
  if (!_canvas) return;
  _canvasCtx = _canvas.getContext('2d');
  _canvasDPR = window.devicePixelRatio || 1;
  _canvasW = _canvas.offsetWidth;
  _canvasH = _canvas.offsetHeight;
  _canvas.width  = _canvasW * _canvasDPR;
  _canvas.height = _canvasH * _canvasDPR;
  _canvasCtx.setTransform(_canvasDPR, 0, 0, _canvasDPR, 0, 0);
}

let _resizeTimer = null;
function _initCanvasResize() {
  _setupCanvas();
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    // Android回転時に複数回発火するためデバウンス
    _resizeTimer = setTimeout(_setupCanvas, 150);
  }, { passive: true });
}

// Export OGG のときに「ARP/PSEQ を止める」責務をここから分離する
let stopArpIfPlaying = () => {};
let stopPseqIfPlaying = () => {};

export function registerExportStopHandlers({ stopArpIfPlaying: fn1, stopPseqIfPlaying: fn2 } = {}) {
  if (typeof fn1 === 'function') stopArpIfPlaying = fn1;
  if (typeof fn2 === 'function') stopPseqIfPlaying = fn2;
}

export function initAudio() {
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

/**
 * モバイル（特に iOS Safari）では AudioContext が suspended のまま
 * `resume()` の Promise を待たずに `start()` すると無音になり得る。
 * 再生直前に必ず await すること。
 */
export async function ensureAudioRunning() {
  initAudio();
  if (audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch {
      // ユーザージェスチャーが無い場合は autoplay ポリシーで拒否され得る
    }
  }
}

export function drawWaveform() {
  if (!document.getElementById('canvas')) return;
  _initCanvasResize();
  startWaveform();
}

/** 音声再生時に外部から呼び出してRAFループを再開する */
export function startWaveform() {
  if (rafId) return; // すでに動いている
  if (!_canvas) _setupCanvas();
  _silentFrames = 0;
  _drawLoop();
}

function _drawLoop() {
  if (!_canvas || !_canvasCtx) return;
  const buf = new Uint8Array(analyser ? analyser.fftSize : 2048);
  if (analyser) analyser.getByteTimeDomainData(buf);

  // 無音検出: 全サンプルが128ならフラット（無音）
  let isSilent = true;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 128) { isSilent = false; break; }
  }

  if (isSilent) {
    _silentFrames++;
    if (_silentFrames > SILENT_FRAMES_THRESHOLD) {
      _drawFrame(buf); // 最後にフラットな状態を描いて止まる
      rafId = null;
      return;
    }
  } else {
    _silentFrames = 0;
  }

  _drawFrame(buf);
  rafId = requestAnimationFrame(_drawLoop);
}

function _drawFrame(buf) {
  const ctx = _canvasCtx;
  const W = _canvasW, H = _canvasH;
  ctx.clearRect(0, 0, W, H);
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
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();
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

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} dest
 * @param {object} params
 * @param {{ startAt?: number, startOffsetSec?: number }} [opts]
 */
function playSEOnCtx(ctx, dest, params, opts = {}) {
  const p = params || state;
  const now = opts.startAt != null
    ? opts.startAt
    : Math.max(0, ctx.currentTime) + (Number(opts.startOffsetSec) || 0);
  const dur = Math.max(0.01, p.duration / 1000);
  const atkT = Math.max(0.001, p.attack / 1000);
  const decT = Math.max(0.001, p.decay / 1000);
  const relT = Math.max(0.001, p.release / 1000);
  // sustain phase must start at or after attack+decay, and before dur
  const susStart = Math.min(now + atkT + decT, now + dur - 0.001);
  const susEnd = Math.max(susStart + 0.001, now + dur - relT);
  const endT = Math.max(susEnd + 0.001, now + dur + relT);

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

/** Max render length (seconds) for layered mix offline / OGG. */
export function computeMixDurationSec(rootState) {
  const rs = rootState || state;
  let layers = rs.layers;
  if ((!layers || layers.length === 0) && rs === state) {
    ensureLayers();
    layers = state.layers;
  }
  if (layers && layers.length > 0) {
    let maxEnd = 0.35;
    for (const L of layers) {
      if (L.muted) continue;
      const delay = (L.delayMs || 0) / 1000;
      const tail = (L.duration || 500) / 1000 + (L.release || 200) / 1000 + 0.35;
      maxEnd = Math.max(maxEnd, delay + tail);
    }
    return maxEnd;
  }
  const p = pickSynthFromState(rs);
  return Math.max(0.35, p.duration / 1000 + p.release / 1000 + 0.35);
}

/**
 * Mix all layers into `dest`. `rootState` may be global `state` or a preset `{ layers: [...] }` (no `ensureLayers` side effects on preset-only objects).
 */
export function playLayersOnCtx(ctx, dest, rootState) {
  const rs = rootState || state;
  let layers = rs.layers;
  if ((!layers || layers.length === 0) && rs === state) {
    ensureLayers();
    layers = state.layers;
  }
  if (layers && layers.length > 0) {
    const baseNow = Math.max(0, ctx.currentTime);
    for (const layer of layers) {
      if (layer.muted) continue;
      const g = ctx.createGain();
      g.gain.value = Math.max(0, Math.min(1, layer.mix));
      g.connect(dest);
      const p = pickSynthFromState(layer);
      playSEOnCtx(ctx, g, p, { startAt: baseNow + (layer.delayMs || 0) / 1000 });
    }
    return;
  }
  playSEOnCtx(ctx, dest, pickSynthFromState(rs));
}

/** Play single flat params (Temp Board legacy cards). */
export function playFlatParamsOnCtx(ctx, dest, flatParams) {
  playSEOnCtx(ctx, dest, flatParams);
}

/** Slot / card playback: layered snapshot or flat preset. */
export function playAnyParamsOnCtx(ctx, dest, p) {
  if (p && p.layers && Array.isArray(p.layers) && p.layers.length > 0) {
    playLayersOnCtx(ctx, dest, p);
  } else {
    playSEOnCtx(ctx, dest, p);
  }
}

/** UI badges / timeouts — ms (capped). */
export function estimatePlaybackDurationMs(flatOrState) {
  if (flatOrState?.layers?.length) {
    return Math.min(computeMixDurationSec(flatOrState) * 1000 + 100, 8000);
  }
  const p = flatOrState || {};
  return Math.min((p.duration || 500) + (p.release || 200) + 200, 4000);
}

export async function playSE() {
  await ensureAudioRunning();
  pushActiveToLayers();
  playLayersOnCtx(audioCtx, masterGain, state);
  startWaveform(); // 無音でRAFが停止していた場合に再開
}

export async function exportWAV() {
  initAudio();
  pushActiveToLayers();
  const dur = computeMixDurationSec(state);
  const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const offGain = offCtx.createGain();
  offGain.gain.value = state.exportAtPlaybackVolume ? Math.max(0, Math.min(1, state.volume)) : 1;
  offGain.connect(offCtx.destination);
  playLayersOnCtx(offCtx, offGain, state);
  const rendered = await offCtx.startRendering();
  const wav = encodeWAV(rendered);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (app.activePreset || 'se') + '.wav';
  a.click();
}

export async function exportMP3() {
  initAudio();
  const lame = window.lamejs;
  if (!lame) {
    showToast(t('toast.mp3NoLame'));
    return;
  }

  pushActiveToLayers();
  const dur = computeMixDurationSec(state);
  const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const offGain = offCtx.createGain();
  offGain.gain.value = state.exportAtPlaybackVolume ? Math.max(0, Math.min(1, state.volume)) : 1;
  offGain.connect(offCtx.destination);
  playLayersOnCtx(offCtx, offGain, state);
  const rendered = await offCtx.startRendering();

  const sampleRate = rendered.sampleRate;
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const len = left.length;

  const toInt16 = (f) => Math.max(-32768, Math.min(32767, f < 0 ? f * 0x8000 : f * 0x7FFF));

  const encoder = new lame.Mp3Encoder(2, sampleRate, 128);
  const chunkSize = 1152;
  const mp3Data = [];
  const leftBuf = new Int16Array(chunkSize);
  const rightBuf = new Int16Array(chunkSize);

  for (let i = 0; i < len; i += chunkSize) {
    const count = Math.min(chunkSize, len - i);
    for (let j = 0; j < count; j++) {
      leftBuf[j] = toInt16(left[i + j]);
      rightBuf[j] = toInt16(right[i + j]);
    }
    const chunk = encoder.encodeBuffer(leftBuf.subarray(0, count), rightBuf.subarray(0, count));
    if (chunk.length > 0) mp3Data.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length > 0) mp3Data.push(tail);

  const blob = new Blob(mp3Data, { type: 'audio/mpeg' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (app.activePreset || 'se') + '.mp3';
  a.click();
}

export async function exportOGG() {
  // NOTE:
  // Browsers can encode OGG (usually Opus) via MediaRecorder.
  // We render by actually playing into an in-memory MediaStreamDestination and record it.
  initAudio();
  const AudioRec = window.MediaRecorder;
  if (!AudioRec) {
    showToast(t('toast.oggNoMediaRecorder'));
    return;
  }

  const candidates = [
    'audio/ogg;codecs=opus',
    'audio/ogg; codecs=opus',
    'audio/ogg',
    'audio/webm;codecs=opus',
    'audio/webm; codecs=opus',
    'audio/webm'
  ];
  let mimeType = null;
  for (const t of candidates) {
    try {
      if (AudioRec.isTypeSupported && AudioRec.isTypeSupported(t)) { mimeType = t; break; }
    } catch {}
  }
  if (!mimeType) {
    showToast(t('toast.oggNoMimeType'));
    return;
  }

  // optional: stop current ARP/PSEQ playback to avoid mixing.
  try { stopArpIfPlaying(); } catch {}
  try { stopPseqIfPlaying(); } catch {}

  await ensureAudioRunning();

  const recorderDest = audioCtx.createMediaStreamDestination();
  const exportGain = audioCtx.createGain();
  // Default: 0dB固定（state.exportAtPlaybackVolume が true の場合のみ state.volume を適用）
  exportGain.gain.value = state.exportAtPlaybackVolume ? Math.max(0, Math.min(1, state.volume)) : 1;
  exportGain.connect(recorderDest);

  let recorder;
  const chunks = [];
  try {
    recorder = new AudioRec(recorderDest.stream, { mimeType });
  } catch (e) {
    showToast(t('toast.oggInitFailed'));
    return;
  }

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Start recording before playback starts.
  recorder.start();

  pushActiveToLayers();
  const dur = computeMixDurationSec(state);
  playLayersOnCtx(audioCtx, exportGain, state);
  const stopMs = Math.ceil(dur * 1000 + 250); // small safety tail
  window.setTimeout(() => {
    try { recorder.stop(); } catch {}
  }, stopMs);

  await done;
  if (!chunks.length) {
    showToast(t('toast.oggEmpty'));
    return;
  }

  const blob = new Blob(chunks, { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (app.activePreset || 'se') + '.ogg';
  a.click();
}

function _hasLayers(p) {
  return p && Array.isArray(p.layers) && p.layers.length > 0;
}

/** params.volume を適用するゲイン値を返す（state.exportAtPlaybackVolume が false なら常に 1） */
function _exportGainValue(params) {
  if (!state.exportAtPlaybackVolume) return 1;
  const v = params?.volume;
  return (typeof v === 'number' && Number.isFinite(v)) ? Math.max(0, Math.min(1, v)) : 1;
}

export async function renderParamsToWAV(params) {
  initAudio();
  const gainVal = _exportGainValue(params);
  if (_hasLayers(params)) {
    const dur = computeMixDurationSec(params);
    const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const offGain = offCtx.createGain();
    offGain.gain.value = gainVal;
    offGain.connect(offCtx.destination);
    playLayersOnCtx(offCtx, offGain, params);
    const rendered = await offCtx.startRendering();
    return encodeWAV(rendered);
  }
  const dur = params.duration / 1000 + params.release / 1000 + 0.3;
  const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const offGain = offCtx.createGain();
  offGain.gain.value = gainVal;
  offGain.connect(offCtx.destination);
  playSEOnCtx(offCtx, offGain, params);
  const rendered = await offCtx.startRendering();
  return encodeWAV(rendered);
}

export async function renderParamsToMP3(params) {
  initAudio();
  const lame = window.lamejs;
  if (!lame) return null;
  const gainVal = _exportGainValue(params);
  let rendered;
  if (_hasLayers(params)) {
    const dur = computeMixDurationSec(params);
    const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const offGain = offCtx.createGain();
    offGain.gain.value = gainVal;
    offGain.connect(offCtx.destination);
    playLayersOnCtx(offCtx, offGain, params);
    rendered = await offCtx.startRendering();
  } else {
    const dur = params.duration / 1000 + params.release / 1000 + 0.3;
    const offCtx = new OfflineAudioContext(2, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
    const offGain = offCtx.createGain();
    offGain.gain.value = gainVal;
    offGain.connect(offCtx.destination);
    playSEOnCtx(offCtx, offGain, params);
    rendered = await offCtx.startRendering();
  }
  const sampleRate = rendered.sampleRate;
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const len = left.length;
  const toInt16 = (f) => Math.max(-32768, Math.min(32767, f < 0 ? f * 0x8000 : f * 0x7FFF));
  const encoder = new lame.Mp3Encoder(2, sampleRate, 128);
  const chunkSize = 1152;
  const mp3Data = [];
  const lBuf = new Int16Array(chunkSize);
  const rBuf = new Int16Array(chunkSize);
  for (let i = 0; i < len; i += chunkSize) {
    const count = Math.min(chunkSize, len - i);
    for (let j = 0; j < count; j++) { lBuf[j] = toInt16(left[i+j]); rBuf[j] = toInt16(right[i+j]); }
    const chunk = encoder.encodeBuffer(lBuf.subarray(0, count), rBuf.subarray(0, count));
    if (chunk.length > 0) mp3Data.push(chunk);
  }
  const tail = encoder.flush();
  if (tail.length > 0) mp3Data.push(tail);
  const out = new Uint8Array(mp3Data.reduce((s, c) => s + c.length, 0));
  let off = 0; for (const c of mp3Data) { out.set(c, off); off += c.length; }
  return out;
}

export async function renderParamsToOGG(params) {
  initAudio();
  const AudioRec = window.MediaRecorder;
  if (!AudioRec) return null;
  const candidates = ['audio/ogg;codecs=opus', 'audio/ogg; codecs=opus', 'audio/ogg',
    'audio/webm;codecs=opus', 'audio/webm; codecs=opus', 'audio/webm'];
  let mimeType = null;
  for (const mt of candidates) {
    try { if (AudioRec.isTypeSupported?.(mt)) { mimeType = mt; break; } } catch {}
  }
  if (!mimeType) return null;
  await ensureAudioRunning();
  const recDest = audioCtx.createMediaStreamDestination();
  const gain = audioCtx.createGain();
  gain.gain.value = _exportGainValue(params);
  gain.connect(recDest);
  let recorder;
  const chunks = [];
  try { recorder = new AudioRec(recDest.stream, { mimeType }); } catch { gain.disconnect(); return null; }
  recorder.ondataavailable = (ev) => { if (ev.data?.size > 0) chunks.push(ev.data); };
  const done = new Promise((res) => { recorder.onstop = () => res(); });
  recorder.start();
  let stopMs;
  if (_hasLayers(params)) {
    playLayersOnCtx(audioCtx, gain, params);
    stopMs = Math.ceil(computeMixDurationSec(params) * 1000 + 250);
  } else {
    const { dur } = playSEOnCtx(audioCtx, gain, params);
    stopMs = Math.ceil(dur * 1000 + 250);
  }
  window.setTimeout(() => { try { recorder.stop(); } catch {} }, stopMs);
  await done;
  gain.disconnect();
  if (!chunks.length) return null;
  return new Blob(chunks, { type: mimeType });
}

function encodeWAV(buffer) {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const ab = new ArrayBuffer(44 + len * numCh * 2);
  const view = new DataView(ab);
  const wr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  wr(0, 'RIFF'); view.setUint32(4, 36 + len * numCh * 2, true);
  wr(8, 'WAVE'); wr(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true); view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true); wr(36, 'data');
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const ch = [];
  for (let c = 0; c < numCh; c++) ch.push(buffer.getChannelData(c));
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return ab;
}

// 他モジュールが必要な音声コンテキスト
export { audioCtx, analyser, masterGain };

// PSEQ / ARP / Compare / TempBoard が呼ぶ「単発SE再生」
export { playSEOnCtx };


