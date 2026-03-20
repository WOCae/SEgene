export const state = {
  wave: 'square',
  attack: 10, decay: 100, sustain: 0.3, release: 200,
  frequency: 440, sweep: 0,
  cutoff: 8000, resonance: 1, filterType: 'lowpass',
  distortion: 0, reverb: 0, vibrato: 0,
  duration: 500,
  volume: 0.8,

  // When enabled, auto-play after editing sliders and when clicking presets.
  // (Used for ADSR/pitch/filter/effects sliders in the editor area.)
  autoPlayOnEdit: true
};

// UI/保存名など「状態」だが editor 側で更新されるものをまとめる
export const app = {
  // Built-in presets UI
  currentCategory: '8bit',

  // Active item name (used by compare + temp board)
  activePreset: null,

  // User library selection (game -> subtab -> item)
  activeUserGameId: null,
  activeUserSubTabId: null
};

