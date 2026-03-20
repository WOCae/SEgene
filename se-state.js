export const state = {
  wave: 'square',
  attack: 10, decay: 100, sustain: 0.3, release: 200,
  frequency: 440, sweep: 0,
  cutoff: 8000, resonance: 1, filterType: 'lowpass',
  distortion: 0, reverb: 0, vibrato: 0,
  duration: 500,
  volume: 0.8
};

// UI/保存名など「状態」だが editor 側で更新されるものをまとめる
export const app = {
  currentCategory: '8bit',
  activePreset: null
};

