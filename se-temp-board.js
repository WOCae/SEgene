import { state, app } from './se-state.js';
import { initAudio, audioCtx, masterGain, playSEOnCtx } from './se-audio-engine.js';
import { showToast } from './se-toast.js';
import { updateParam, syncVolumeSlider } from './se-editor-ui.js';
import { dbGetTempBoard, dbSaveTempBoard } from './se-db.js';
import { t } from './se-i18n.js';

const WAVE_SHORT = { square: 'SQR', sine: 'SIN', sawtooth: 'SAW', triangle: 'TRI', noise: 'NSE' };

let tbCards = []; // [{ id, name, params, color }]
let tbDragId = null;
let tbDragOverId = null;
const TB_COLORS = ['#6c63ff', '#40c4aa', '#ffb74d', '#ff6b6b', '#39d98a', '#f06292', '#9c94ff', '#80cbc4'];

function tbPersist() {
  dbSaveTempBoard(tbCards); // fire and forget
}

export function tbAdd(params, name) {
  const p = params || JSON.parse(JSON.stringify(state));
  const n = name || app.activePreset || `SE ${tbCards.length + 1}`;
  const color = TB_COLORS[tbCards.length % TB_COLORS.length];
  tbCards.push({ id: Date.now() + Math.random(), name: n, params: p, color });
  tbPersist();
  tbRender();
  showToast(t('toast.tbSaved', n));
}

export function tbDelete(id) {
  tbCards = tbCards.filter(c => c.id !== id);
  tbPersist();
  tbRender();
}

export function tbClearAll() {
  if (!tbCards.length) return;
  tbCards = [];
  tbPersist();
  tbRender();
  showToast(t('toast.tbCleared'));
}

export function tbPlay(id) {
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

export function tbLoadToEditor(id) {
  const card = tbCards.find(c => c.id === id);
  if (!card) return;

  Object.assign(state, card.params);

  const ids = ['attack', 'decay', 'release', 'frequency', 'sweep', 'cutoff', 'resonance', 'distortion', 'reverb', 'vibrato', 'duration'];
  ids.forEach((k) => {
    const el = document.getElementById(k);
    if (el) {
      el.value = state[k];
      updateParam(k, state[k]);
    }
  });

  document.getElementById('sustain').value = state.sustain * 100;
  updateParam('sustain', state.sustain * 100);

  const wn = { square: 'SQUARE', sine: 'SINE', sawtooth: 'SAW', triangle: 'TRI', noise: 'NOISE' };
  document.querySelectorAll('.wave-btn').forEach(b => b.classList.toggle('active', b.textContent === wn[state.wave]));

  if (state.filterType) document.getElementById('filterType').value = state.filterType;
  syncVolumeSlider();

  document.getElementById('presetInfoName').textContent = card.name;
  document.getElementById('presetInfoDesc').textContent = t('info.fromTb');
  showToast(t('toast.loadedToEditor', card.name));
}

export function tbRenameCard(id, newName) {
  const card = tbCards.find(c => c.id === id);
  if (card) { card.name = newName || card.name; tbPersist(); }
}

// Drag & Drop
export function tbDragStart(id, e) {
  tbDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const el = document.getElementById(`tb-card-${id}`);
    if (el) el.classList.add('dragging');
  }, 0);
}

export function tbDragEnd(id) {
  tbDragId = null;
  tbDragOverId = null;
  document.querySelectorAll('.tcard').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

export function tbDragOver(id, e) {
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

export function tbDrop(id, e) {
  e.preventDefault();
  if (!tbDragId || tbDragId === id) return;
  const fromIdx = tbCards.findIndex(c => c.id === tbDragId);
  const toIdx = tbCards.findIndex(c => c.id === id);
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
    list.innerHTML = `<div class="tboard-empty" onclick="tbAdd()">${t('tb.empty')}</div>`;
    return;
  }

  list.innerHTML = tbCards.map(card => {
    const wl = WAVE_SHORT[card.params.wave] || card.params.wave;
    const freq = card.params.frequency;
    const dur = (card.params.duration / 1000).toFixed(2);
    const dist = card.params.distortion > 0 ? `dist:${card.params.distortion}` : '';
    const rvb = card.params.reverb > 0 ? `rvb:${card.params.reverb}%` : '';
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
        <span class="tcard-drag-handle" title="${t('tb.dragHandle')}">⠿</span>
        <span
          class="tcard-name"
          contenteditable="true"
          spellcheck="false"
          onblur="tbRenameCard(${card.id},this.textContent.trim())"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
        >${card.name}</span>
        <span class="tcard-wave" style="color:${card.color};border-color:${card.color}44;background:${card.color}18">${wl}</span>
      </div>
      <div class="tcard-tags">${tags.map(t => `<span class="tcard-tag">${t}</span>`).join('')}</div>
      <div class="tcard-actions">
        <button class="tcard-btn play" onclick="tbPlay(${card.id})">${t('tb.playBtn')}</button>
        <button class="tcard-btn" onclick="tbLoadToEditor(${card.id})">${t('tb.editBtn')}</button>
        <button class="tcard-btn del" onclick="tbDelete(${card.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

export async function initTb() {
  tbCards = await dbGetTempBoard();
  tbRender();
}

// Re-render cards when language changes
document.addEventListener('se:langchange', () => tbRender());

