/** @typedef {{ id: string, name: string, mix: number, delayMs: number, muted: boolean } & Record<string, unknown>} SeLayer */

export const SYNTH_PARAM_KEYS = [
  'wave', 'attack', 'decay', 'sustain', 'release', 'frequency', 'sweep',
  'cutoff', 'resonance', 'filterType', 'distortion', 'reverb', 'vibrato', 'duration'
];

export function genLayerId() {
  return 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function defaultSynthParams() {
  return {
    wave: 'square',
    attack: 10, decay: 100, sustain: 0.3, release: 200,
    frequency: 440, sweep: 0,
    cutoff: 8000, resonance: 1, filterType: 'lowpass',
    distortion: 0, reverb: 0, vibrato: 0,
    duration: 500
  };
}

/**
 * Flat `state` keeps synth params as the editing buffer for the active layer
 * (plus volume, autoPlayOnEdit, layers[], activeLayerIndex).
 */
export const state = {
  ...defaultSynthParams(),
  volume: 0.8,
  exportAtPlaybackVolume: false,
  autoPlayOnEdit: true,
  /** @type {SeLayer[]|null} */
  layers: null,
  activeLayerIndex: 0
};

export function pickSynthFromState(s) {
  const d = defaultSynthParams();
  const o = {};
  for (const k of SYNTH_PARAM_KEYS) {
    o[k] = s[k] !== undefined ? s[k] : d[k];
  }
  return o;
}

/** One layer row (for layers[]). */
export function createLayer(name, synth) {
  return {
    id: genLayerId(),
    name: name || 'Layer',
    mix: 1,
    delayMs: 0,
    muted: false,
    ...pickSynthFromState(synth || defaultSynthParams())
  };
}

export function ensureLayers() {
  if (!state.layers || !Array.isArray(state.layers) || state.layers.length === 0) {
    state.layers = [createLayer('Layer 1', state)];
    state.activeLayerIndex = 0;
  }
  if (state.activeLayerIndex == null || state.activeLayerIndex < 0 || state.activeLayerIndex >= state.layers.length) {
    state.activeLayerIndex = 0;
  }
}

export function pushActiveToLayers() {
  ensureLayers();
  const L = state.layers[state.activeLayerIndex];
  if (!L) return;
  Object.assign(L, pickSynthFromState(state));
}

export function pullLayerToState(idx) {
  ensureLayers();
  const i = Math.max(0, Math.min(idx, state.layers.length - 1));
  state.activeLayerIndex = i;
  const L = state.layers[i];
  Object.assign(state, pickSynthFromState(L));
}

/** For library / preset save: active layer synth + master volume (no layers[]). */
export function flattenActiveLayerForPreset() {
  pushActiveToLayers();
  const L = state.layers[state.activeLayerIndex];
  return {
    ...pickSynthFromState(L),
    volume: state.volume
  };
}

/** After loading a flat preset into `state`, collapse to a single layer. */
export function replaceLayersWithSingleFromFlat() {
  const syn = pickSynthFromState(state);
  state.layers = [createLayer('Layer 1', syn)];
  state.activeLayerIndex = 0;
  Object.assign(state, syn);
}

/**
 * Apply AI-generated multi-layer result to `state` (each row: synth fields + optional name, mix, delayMs, muted).
 * Does not change `state.volume` (master).
 */
export function applyLayersFromAiParsed(layerRows) {
  if (!Array.isArray(layerRows) || layerRows.length === 0) {
    replaceLayersWithSingleFromFlat();
    return;
  }
  state.layers = layerRows.map((row, i) => {
    const syn = pickSynthFromState(row);
    const L = createLayer(String(row.name || `Layer ${i + 1}`), syn);
    if (row.mix !== undefined && row.mix !== null && Number.isFinite(Number(row.mix))) {
      L.mix = Math.max(0, Math.min(1, Number(row.mix)));
    }
    if (row.delayMs !== undefined && row.delayMs !== null && Number.isFinite(Number(row.delayMs))) {
      L.delayMs = Math.max(0, Math.min(5000, Math.round(Number(row.delayMs))));
    }
    L.muted = !!row.muted;
    return L;
  });
  state.activeLayerIndex = 0;
  Object.assign(state, pickSynthFromState(state.layers[0]));
}

/** Full layer stack + master volume for library / JSON export (presetVersion 2). */
export function serializePresetForLibrary() {
  pushActiveToLayers();
  ensureLayers();
  return {
    presetVersion: 2,
    volume: state.volume,
    activeLayerIndex: state.activeLayerIndex,
    layers: state.layers.map((L) => ({
      id: L.id,
      name: L.name,
      mix: L.mix,
      delayMs: L.delayMs,
      muted: !!L.muted,
      ...pickSynthFromState(L)
    }))
  };
}

/**
 * Normalize arbitrary params (e.g. Temp Board full `state`) to a storable preset object.
 * Layered → presetVersion 2; otherwise flat synth + volume (legacy-compatible).
 */
export function normalizePresetParamsForStorage(raw) {
  if (!raw || typeof raw !== 'object') return serializePresetForLibrary();
  if (raw.layers && Array.isArray(raw.layers) && raw.layers.length > 0) {
    return {
      presetVersion: 2,
      volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume)
        ? Math.max(0, Math.min(1, raw.volume))
        : 0.8,
      activeLayerIndex: Math.max(0, Math.min(raw.activeLayerIndex ?? 0, raw.layers.length - 1)),
      layers: raw.layers.map((row, i) => {
        const syn = pickSynthFromState(row);
        return {
          id: String(row.id || genLayerId()),
          name: String(row.name || `Layer ${i + 1}`),
          mix: row.mix !== undefined && row.mix !== null
            ? Math.max(0, Math.min(1, Number(row.mix)))
            : 1,
          delayMs: row.delayMs !== undefined && row.delayMs !== null
            ? Math.max(0, Math.min(5000, Math.round(Number(row.delayMs))))
            : 0,
          muted: !!row.muted,
          ...syn
        };
      })
    };
  }
  return {
    ...pickSynthFromState(raw),
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume)
      ? Math.max(0, Math.min(1, raw.volume))
      : 0.8
  };
}

/** Apply preset `params` from library / JSON import onto `state`. */
export function applyPresetParamsFromLibrary(params) {
  if (!params || typeof params !== 'object') return;
  if (params.layers && Array.isArray(params.layers) && params.layers.length > 0) {
    state.layers = params.layers.map((row, i) => {
      const syn = pickSynthFromState(row);
      const L = createLayer(String(row.name || `Layer ${i + 1}`), syn);
      if (row.id) L.id = String(row.id);
      if (row.mix !== undefined && row.mix !== null && Number.isFinite(Number(row.mix))) {
        L.mix = Math.max(0, Math.min(1, Number(row.mix)));
      }
      if (row.delayMs !== undefined && row.delayMs !== null && Number.isFinite(Number(row.delayMs))) {
        L.delayMs = Math.max(0, Math.min(5000, Math.round(Number(row.delayMs))));
      }
      L.muted = !!row.muted;
      return L;
    });
    state.activeLayerIndex = Math.max(0, Math.min(params.activeLayerIndex ?? 0, state.layers.length - 1));
    if (params.volume != null && Number.isFinite(Number(params.volume))) {
      state.volume = Math.max(0, Math.min(1, Number(params.volume)));
    }
    pullLayerToState(state.activeLayerIndex);
  } else {
    Object.assign(state, pickSynthFromState(params));
    if (params.volume != null && Number.isFinite(Number(params.volume))) {
      state.volume = Math.max(0, Math.min(1, Number(params.volume)));
    }
    replaceLayersWithSingleFromFlat();
  }
}

// UI/保存名など「状態」だが editor 側で更新されるものをまとめる
export const app = {
  currentCategory: '8bit',
  activePreset: null,
  activeUserGameId: null,
  activeUserSubTabId: null,
  /** User library: sidebar preset list reorder mode (handle drag only). */
  libraryReorderMode: false
};
