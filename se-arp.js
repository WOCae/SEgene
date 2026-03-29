import { state } from './se-state.js';
import { audioCtx, masterGain, playSEOnCtx, ensureAudioRunning } from './se-audio-engine.js';
import { scheduleSessionSave } from './se-db.js';

export const ARP = {
  bpm: 140,
  div: 8,
  steps: 16,
  playing: false,
  currentStep: 0,
  intervalId: null,
  grid: Array.from({ length: 4 }, () => new Array(16).fill(false)),
  noteLabels: [],
  noteFreqs: []
};

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  penta: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  free: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToHz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

function arpRenderGrid() {
  const grid = document.getElementById('arpGrid');
  grid.innerHTML = '';
  const steps = ARP.steps;

  for (let r = 3; r >= 0; r--) {
    const label = document.createElement('div');
    label.className = 'arp-row-label';
    label.textContent = ARP.noteLabels[r] || ('R' + (r + 1));
    grid.appendChild(label);

    const row = document.createElement('div');
    row.className = 'arp-steps';
    row.style.gridTemplateColumns = `repeat(${steps}, 1fr)`;

    for (let s = 0; s < steps; s++) {
      const cell = document.createElement('div');
      cell.className = 'arp-step ' + (ARP.grid[r][s] ? 'note-on' : 'note-off');
      cell.dataset.row = r;
      cell.dataset.step = s;
      cell.onclick = () => {
        ARP.grid[r][s] = !ARP.grid[r][s];
        cell.className = 'arp-step ' + (ARP.grid[r][s] ? 'note-on' : 'note-off');
        cell.dataset.row = r;
        scheduleSessionSave();
      };
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
}

export function arpRebuildNotes() {
  const scale = SCALES[document.getElementById('arpScale').value] || SCALES.major;
  const root = parseInt(document.getElementById('arpRoot').value);
  const oct = parseInt(document.getElementById('arpOct').value);
  const indices = [0, 1, 2, 3].map(i => i % scale.length);

  ARP.noteFreqs = indices.map(i => midiToHz(root + scale[i] + oct * 12));
  ARP.noteLabels = indices.map(i => NOTE_NAMES[(root + scale[i]) % 12] + oct);
  arpRenderGrid();
}

function arpStepInterval() {
  document.querySelectorAll('.arp-step.current').forEach(el => el.classList.remove('current'));
  const step = ARP.currentStep;
  document.querySelectorAll(`.arp-step[data-step="${step}"]`).forEach(el => el.classList.add('current'));

  ensureAudioRunning().then(() => {
    for (let r = 0; r < 4; r++) {
      if (ARP.grid[r][step]) {
        const freq = ARP.noteFreqs[r];
        const noteDur = (60 / ARP.bpm) * (4 / ARP.div) * 1000 * 0.82;
        playSEOnCtx(audioCtx, masterGain, { ...state, frequency: freq, duration: noteDur, sweep: 0 });
      }
    }
  });
  ARP.currentStep = (step + 1) % ARP.steps;
}

export async function arpStart() {
  if (ARP.playing) return;
  await ensureAudioRunning();
  ARP.playing = true;
  ARP.currentStep = 0;

  document.getElementById('arpStatus').textContent = 'PLAYING';
  document.getElementById('arpStatus').classList.add('playing');

  const ms = (60 / ARP.bpm) * (4 / ARP.div) * 1000;
  arpStepInterval();
  ARP.intervalId = setInterval(arpStepInterval, ms);
}

export function arpStop() {
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

export function arpBpmChange(val) { ARP.bpm = parseInt(val); document.getElementById('vArpBpm').textContent = val; arpRestart(); scheduleSessionSave(); }
export function arpDivChange() { ARP.div = parseInt(document.getElementById('arpDiv').value); arpRestart(); scheduleSessionSave(); }

export function arpStepsChange() {
  const was = ARP.playing;
  if (was) arpStop();

  ARP.steps = parseInt(document.getElementById('arpSteps').value);
  ARP.grid = ARP.grid.map(row => {
    const n = new Array(ARP.steps).fill(false);
    row.forEach((v, i) => { if (i < ARP.steps) n[i] = v; });
    return n;
  });

  arpRenderGrid();
  if (was) arpStart();
  scheduleSessionSave();
}

export function arpPattern(type) {
  const steps = ARP.steps;
  ARP.grid = Array.from({ length: 4 }, () => new Array(steps).fill(false));

  if (type === 'clear') { arpRenderGrid(); scheduleSessionSave(); return; }
  if (type === 'up') { for (let s = 0; s < steps; s++) ARP.grid[s % 4][s] = true; }
  else if (type === 'down') { for (let s = 0; s < steps; s++) ARP.grid[3 - (s % 4)][s] = true; }
  else if (type === 'updown') { const seq = [0, 1, 2, 3, 2, 1]; for (let s = 0; s < steps; s++) ARP.grid[seq[s % seq.length]][s] = true; }
  else if (type === 'rand') { for (let s = 0; s < steps; s++) ARP.grid[Math.floor(Math.random() * 4)][s] = true; }

  arpRenderGrid();
  scheduleSessionSave();
}

export function initArp() {
  arpRebuildNotes();
  arpPattern('up');
}

