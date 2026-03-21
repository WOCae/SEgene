/**
 * ライブラリ／プリセット周りのデバッグ出力。
 * 止める: コンソールで `window.__SEGENE_DEBUG_LIBRARY = false`
 */
export function debugLibrary(...args) {
  if (typeof window !== 'undefined' && window.__SEGENE_DEBUG_LIBRARY === false) return;
  console.log('[SEgene library]', ...args);
}
