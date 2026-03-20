import { state } from './se-state.js';
import { initAudio, audioCtx, masterGain, playSEOnCtx } from './se-audio-engine.js';
import { scheduleSessionSave } from './se-db.js';

export const PSEQ = {
  bpm: 120,
  div: 8,
  len: 16,
  playing: false,
  currentStep: 0,
  intervalId: null,
  // steps[i] = { semitone: 0..N, muted: false }
  steps: Array.from({ length: 16 }, () => ({ semitone: 0, muted: false })),
  scaleNotes: [],   // array of { hz, label } from low to high
  mutedSteps: new Set()
};

const PSEQ_SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  penta: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const NOTE_NAMES2 = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToHz2(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

export function pseqRebuild() {
  const scale = PSEQ_SCALES[document.getElementById('pseqScale').value] || PSEQ_SCALES.major;
  const root = parseInt(document.getElementById('pseqRoot').value);
  const oct = parseInt(document.getElementById('pseqOct').value);
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
      scheduleSessionSave();
    };

    wrap.addEventListener('mousedown', (e) => { dragging = true; onMove(e.clientY); e.preventDefault(); });
    wrap.addEventListener('touchstart', (e) => { dragging = true; onMove(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
    document.addEventListener('mousemove', (e) => { if (dragging) onMove(e.clientY); });
    document.addEventListener('touchmove', (e) => { if (dragging) onMove(e.touches[0].clientY); }, { passive: true });
    document.addEventListener('mouseup', () => { dragging = false; });
    document.addEventListener('touchend', () => { dragging = false; });

    // Right-click to mute step
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (PSEQ.mutedSteps.has(s)) PSEQ.mutedSteps.delete(s);
      else PSEQ.mutedSteps.add(s);
      lane.classList.toggle('muted', PSEQ.mutedSteps.has(s));
      scheduleSessionSave();
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

export function pseqStart() {
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

export function pseqStop() {
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

export function pseqBpmChange(v) { PSEQ.bpm = parseInt(v); document.getElementById('vPseqBpm').textContent = v; pseqRestart(); scheduleSessionSave(); }
export function pseqDivChange() { PSEQ.div = parseInt(document.getElementById('pseqDiv').value); pseqRestart(); scheduleSessionSave(); }

export function pseqLenChange() {
  const was = PSEQ.playing;
  if (was) pseqStop();
  const newLen = parseInt(document.getElementById('pseqLen').value);
  while (PSEQ.steps.length < newLen) PSEQ.steps.push({ semitone: 0, muted: false });
  PSEQ.len = newLen;
  pseqRenderGrid();
  if (was) pseqStart();
  scheduleSessionSave();
}

export function pseqQuick(type) {
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
  scheduleSessionSave();
}

export function pseqToggleMute() {
  // Toggle mute on all steps (select odd steps for a rhythm feel)
  const allMuted = PSEQ.mutedSteps.size === PSEQ.len;
  PSEQ.mutedSteps.clear();
  if (!allMuted) for (let s = 1; s < PSEQ.len; s += 2) PSEQ.mutedSteps.add(s);
  pseqRenderGrid();
  scheduleSessionSave();
}

export function togglePseq(on) {
  const panel = document.getElementById('pseqPanel');
  if (panel) panel.style.display = on ? 'block' : 'none';
  if (!on && PSEQ.playing) pseqStop();
}

export function initPseq() {
  pseqRebuild();
  pseqQuick('scale-up');
}

