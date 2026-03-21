// se-i18n.js — Internationalization (ja / en)

const STRINGS = {
  ja: {
    // Header
    'header.compare': '⊟ SE 比較',
    'header.lang': 'EN',

    // CMP Modal
    'cmp.title': 'SE COMPARE — 同時比較',
    'cmp.playAll': '▶▶ 全て再生',
    'cmp.playSeq': '▶ 順番に再生',
    'cmp.addSlot': '＋ スロット追加',
    'cmp.hint': '右クリックで削除 / スロットをクリックして現在の設定をキャプチャ',

    // Preset Manager
    'preset.saveTitle': '現在の設定を保存',
    'preset.namePlaceholder': 'プリセット名を入力…',
    'preset.saveBtn': '保存',
    'preset.savedTitle': '保存済みプリセット',
    'preset.exportAll': '⬇ 全てエクスポート (.json)',
    'preset.import': '⬆ インポート (.json)',

    // Help
    'help.title': 'HELP — 使い方 / 操作',
    'help.closeBtn': '閉じる',

    // ARP
    'arp.scale': 'スケール',
    'arp.root': 'ルート',
    'arp.octave': 'オクターブ',
    'arp.pattern': 'パターン',
    'arp.steps8': '8ステップ',
    'arp.steps16': '16ステップ',
    'arp.div4': '♩ 4分',
    'arp.div8': '♪ 8分',
    'arp.div16': '♬ 16分',
    'arp.div32': '32分',

    // Scale names (shared ARP + PSEQ)
    'scale.major': 'メジャー',
    'scale.minor': 'マイナー',
    'scale.penta': 'ペンタトニック',
    'scale.blues': 'ブルース',
    'scale.chromatic': 'クロマチック',
    'scale.free': 'フリー（半音）',

    // PSEQ
    'pseq.range': 'レンジ',
    'pseq.quick': 'クイック',
    'pseq.scaleUp': '↑ スケール',
    'pseq.scaleDown': '↓ スケール',
    'pseq.rand': '⚄ ランダム',
    'pseq.flat': '― フラット',
    'pseq.mute': '🔇 ミュート',

    // AI Generator
    'aiGen.badge': '✦ AI 生成',
    'aiGen.apiSettings': '⚙ API 設定',
    'aiGen.apiKeyPlaceholder': 'APIキー',
    'aiGen.modelCustomPlaceholder': 'モデルIDを直接入力（例: gemini-2.5-flash）',
    'aiGen.refreshTitle': '最新モデル一覧を取得',
    'aiGen.settingsNote': 'APIキーはブラウザの localStorage に保存されます（サーバーには送信しません）。',
    'aiGen.promptPlaceholder': '勇者がレベルアップする明るい8bit音',
    'aiGen.promptLabel': '作りたいSEを自然言語で説明してください',
    'aiGen.examplesLabel': '例文',
    'aiGen.generateBtn': '✦ 生成する',
    'aiGen.previewBtn': '▶ プレビュー',
    'aiGen.applyBtn': '✓ エディタに適用',
    'aiGen.customOption': '— カスタム入力 —',
    'aiGen.noDesc': '説明を入力してください',
    'aiGen.generating': '生成中…',
    'aiGen.genComplete': '生成完了！プレビューして適用してください',
    'aiGen.error': 'エラー: {0}',
    'aiGen.applied': '「{0}」をエディタに適用しました',

    // Library actions
    'library.addBtn': '＋ ライブラリに追加',
    'library.selectGameSubtab': '先にゲームとサブタブを選択してください',
    'library.selectGame': 'ゲームを選択してください',
    'library.selectSubtab': 'サブタブを選択してください',
    'library.noItems': 'アイテムがありません',
    'library.jszipMissing': 'JSZip が読み込まれていません',
    'library.renamePrompt': 'SE名を変更:',
    'library.addPrompt': 'SE名を入力:',
    'toast.processing': '{0}件を {1} で処理中…',
    'toast.exportedCount': '{0}件をエクスポートしました',

    // Right panel
    'tb.addBtn': '＋ 現在を保存',
    'tb.clearBtn': '全消去',
    'tb.empty': 'クリックして現在の設定を保存',
    'info.currentPreset': '現在のプリセット',
    'info.selectPreset': 'プリセットを選択してください',
    'info.keys': '<kbd class="kbd">SPACE</kbd> 再生 &nbsp; <kbd class="kbd">T</kbd> 一時保存 &nbsp; <kbd class="kbd">C</kbd> 比較 &nbsp; <kbd class="kbd">A</kbd> アルペジオ &nbsp; <kbd class="kbd">P</kbd> ピッチSEQ &nbsp; <kbd class="kbd">R</kbd> ランダム &nbsp; <kbd class="kbd">S</kbd> 保存',
    'info.tempBoard': 'Temp Board: ドラッグで並び替え / 名前クリックで編集',

    // Mobile
    'mobile.presets': '≡ プリセット',
    'mobile.tools': '⚙ 出力・設定',

    // Toast messages
    'toast.cmpAdded': '比較スロットに追加しました',
    'toast.noSlots': 'スロットがありません',
    'toast.maxSlots': 'スロットは最大4つです',
    'toast.loadedToEditor': '「{0}」をエディタに読み込みました',
    'toast.nameRequired': '名前を入力してください',
    'toast.saved': '「{0}」を保存しました',
    'toast.deleted': '削除しました',
    'toast.loaded': '「{0}」を読み込みました',
    'toast.noPresets': '保存済みプリセットがありません',
    'toast.exported': '{0}件エクスポートしました',
    'toast.imported': '{0}件インポートしました',
    'toast.importFailed': 'JSONの読み込みに失敗しました',
    'toast.tbSaved': '「{0}」を一時保存しました',
    'toast.tbCleared': '一時保存を全消去しました',
    'toast.oggNoMediaRecorder': 'OGG出力: MediaRecorder が利用できません',
    'toast.oggNoMimeType': 'OGG出力: 対応する mimeType が見つかりません',
    'toast.oggInitFailed': 'OGG出力: MediaRecorder初期化に失敗しました',
    'toast.oggEmpty': 'OGG出力: 録音データが空でした',
    'toast.mp3NoLame': 'MP3出力: lamejs が読み込まれていません',

    // Dynamic HTML strings
    'cmp.slot': 'スロット {0}',
    'cmp.currentSettings': '現在の設定',
    'cmp.emptyAdd': '現在の設定を追加',
    'cmp.playBtn': '▶ 再生',
    'cmp.captureBtn': '⊙ キャプチャ',
    'cmp.loadBtn': '↗ エディタへ',
    'preset.empty': '保存済みプリセットはありません',
    'preset.load': '読込',
    'preset.delete': '削除',
    'tb.editBtn': '↗ 編集',
    'tb.playBtn': '▶ 再生',
    'tb.dragHandle': 'ドラッグして並べ替え',

    // Info box / status
    'info.restoredSession': '前回の状態を復元',
    'info.fromCmp': '比較スロットから読み込み',
    'info.fromTb': 'Temp Boardから読み込み',
    'info.random': 'ランダム',
    'info.randomDesc': 'ランダム生成',
    'info.savedAt': '{0} に保存',
    'info.defaultSetting': '設定',

    'locale': 'ja-JP',
  },

  en: {
    // Header
    'header.compare': '⊟ SE COMPARE',
    'header.lang': 'JA',

    // CMP Modal
    'cmp.title': 'SE COMPARE — Side by Side',
    'cmp.playAll': '▶▶ Play All',
    'cmp.playSeq': '▶ Play Sequential',
    'cmp.addSlot': '＋ Add Slot',
    'cmp.hint': 'Right-click to remove / Click slot to capture current settings',

    // Preset Manager
    'preset.saveTitle': 'Save Current Settings',
    'preset.namePlaceholder': 'Enter preset name…',
    'preset.saveBtn': 'Save',
    'preset.savedTitle': 'Saved Presets',
    'preset.exportAll': '⬇ Export All (.json)',
    'preset.import': '⬆ Import (.json)',

    // Help
    'help.title': 'HELP — How to Use',
    'help.closeBtn': 'Close',

    // ARP
    'arp.scale': 'Scale',
    'arp.root': 'Root',
    'arp.octave': 'Octave',
    'arp.pattern': 'Pattern',
    'arp.steps8': '8 steps',
    'arp.steps16': '16 steps',
    'arp.div4': '♩ Quarter',
    'arp.div8': '♪ 8th',
    'arp.div16': '♬ 16th',
    'arp.div32': '32nd',

    // Scale names (shared ARP + PSEQ)
    'scale.major': 'Major',
    'scale.minor': 'Minor',
    'scale.penta': 'Pentatonic',
    'scale.blues': 'Blues',
    'scale.chromatic': 'Chromatic',
    'scale.free': 'Free (semitone)',

    // PSEQ
    'pseq.range': 'Range',
    'pseq.quick': 'Quick',
    'pseq.scaleUp': '↑ Scale',
    'pseq.scaleDown': '↓ Scale',
    'pseq.rand': '⚄ Random',
    'pseq.flat': '― Flat',
    'pseq.mute': '🔇 Mute',

    // AI Generator
    'aiGen.badge': '✦ AI Generate',
    'aiGen.apiSettings': '⚙ API Settings',
    'aiGen.apiKeyPlaceholder': 'API Key',
    'aiGen.modelCustomPlaceholder': 'Enter model ID directly (e.g. gemini-2.5-flash)',
    'aiGen.refreshTitle': 'Fetch latest model list',
    'aiGen.settingsNote': 'API keys are stored in your browser\'s localStorage (never sent to our servers).',
    'aiGen.promptPlaceholder': 'A bright 8-bit sound for leveling up',
    'aiGen.promptLabel': 'Describe the SE you want in natural language',
    'aiGen.examplesLabel': 'Examples',
    'aiGen.generateBtn': '✦ Generate',
    'aiGen.previewBtn': '▶ Preview',
    'aiGen.applyBtn': '✓ Apply to Editor',
    'aiGen.customOption': '— Custom Input —',
    'aiGen.noDesc': 'Please enter a description',
    'aiGen.generating': 'Generating…',
    'aiGen.genComplete': 'Done! Preview or apply to editor.',
    'aiGen.error': 'Error: {0}',
    'aiGen.applied': 'Applied "{0}" to editor',

    // Library actions
    'library.addBtn': '＋ Add to Library',
    'library.selectGameSubtab': 'Please select a game and subtab first',
    'library.selectGame': 'Please select a game',
    'library.selectSubtab': 'Please select a subtab',
    'library.noItems': 'No items',
    'library.jszipMissing': 'JSZip is not loaded',
    'library.renamePrompt': 'Rename SE:',
    'library.addPrompt': 'Enter SE name:',
    'toast.processing': 'Processing {0} items as {1}…',
    'toast.exportedCount': 'Exported {0} item(s)',

    // Right panel
    'tb.addBtn': '＋ Save Current',
    'tb.clearBtn': 'Clear All',
    'tb.empty': 'Click to save current settings',
    'info.currentPreset': 'Current Preset',
    'info.selectPreset': 'Select a preset',
    'info.keys': '<kbd class="kbd">SPACE</kbd> Play &nbsp; <kbd class="kbd">T</kbd> Save Temp &nbsp; <kbd class="kbd">C</kbd> Compare &nbsp; <kbd class="kbd">A</kbd> Arpeggio &nbsp; <kbd class="kbd">P</kbd> Pitch SEQ &nbsp; <kbd class="kbd">R</kbd> Random &nbsp; <kbd class="kbd">S</kbd> Save',
    'info.tempBoard': 'Temp Board: Drag to reorder / Click name to rename',

    // Mobile
    'mobile.presets': '≡ Presets',
    'mobile.tools': '⚙ Output / Settings',

    // Toast messages
    'toast.cmpAdded': 'Added to compare slot',
    'toast.noSlots': 'No slots available',
    'toast.maxSlots': 'Maximum 4 slots allowed',
    'toast.loadedToEditor': 'Loaded "{0}" to editor',
    'toast.nameRequired': 'Please enter a name',
    'toast.saved': 'Saved "{0}"',
    'toast.deleted': 'Deleted',
    'toast.loaded': 'Loaded "{0}"',
    'toast.noPresets': 'No saved presets',
    'toast.exported': 'Exported {0} preset(s)',
    'toast.imported': 'Imported {0} preset(s)',
    'toast.importFailed': 'Failed to load JSON',
    'toast.tbSaved': 'Saved "{0}" to Temp Board',
    'toast.tbCleared': 'Temp Board cleared',
    'toast.oggNoMediaRecorder': 'OGG: MediaRecorder not available',
    'toast.oggNoMimeType': 'OGG: No supported mimeType found',
    'toast.oggInitFailed': 'OGG: MediaRecorder initialization failed',
    'toast.oggEmpty': 'OGG: Recording data was empty',
    'toast.mp3NoLame': 'MP3: lamejs not loaded',

    // Dynamic HTML strings
    'cmp.slot': 'Slot {0}',
    'cmp.currentSettings': 'Current Settings',
    'cmp.emptyAdd': 'Add Current Settings',
    'cmp.playBtn': '▶ Play',
    'cmp.captureBtn': '⊙ Capture',
    'cmp.loadBtn': '↗ To Editor',
    'preset.empty': 'No saved presets',
    'preset.load': 'Load',
    'preset.delete': 'Delete',
    'tb.editBtn': '↗ Edit',
    'tb.playBtn': '▶ Play',
    'tb.dragHandle': 'Drag to reorder',

    // Info box / status
    'info.restoredSession': 'Session restored',
    'info.fromCmp': 'Loaded from compare slot',
    'info.fromTb': 'Loaded from Temp Board',
    'info.random': 'Random',
    'info.randomDesc': 'Randomly generated',
    'info.savedAt': 'Saved {0}',
    'info.defaultSetting': 'Settings',

    'locale': 'en-US',
  }
};

let _lang = localStorage.getItem('se-lang') || 'ja';

export function getLang() { return _lang; }

/** Translate a key, optionally substituting {0}, {1}, … placeholders */
export function t(key, ...args) {
  const dict = STRINGS[_lang] ?? STRINGS.ja;
  let s = dict[key] ?? STRINGS.ja[key] ?? key;
  args.forEach((a, i) => { s = s.replaceAll(`{${i}}`, a); });
  return s;
}

/** Switch language, persist to localStorage, re-apply all translations */
export function setLang(lang) {
  if (lang !== 'ja' && lang !== 'en') return;
  _lang = lang;
  localStorage.setItem('se-lang', lang);
  document.documentElement.lang = lang;
  applyI18n();
  // Let other modules re-render their dynamic content
  document.dispatchEvent(new CustomEvent('se:langchange'));
}

/** Apply translations to all [data-i18n] elements and re-render help body */
export function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);
    // Use innerHTML only when the string contains HTML tags
    if (val.includes('<')) el.innerHTML = val;
    else el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  // Language toggle button label (shows the OTHER language to switch to)
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) langBtn.textContent = t('header.lang');

  _renderHelpBody();
}

function _renderHelpBody() {
  const body = document.getElementById('helpBody');
  if (!body) return;
  body.innerHTML = _lang === 'en' ? _helpEn() : _helpJa();
}

function _helpJa() {
  return `
    <h3 class="help-h3">このツールでできること</h3>
    <p>左のプリセットからパラメータを読み込み、中央のエディタで波形・ADSR・フィルタ/エフェクト等を調整し、<b>再生</b> / <b>波形表示</b> / <b>WAV/OGG 書き出し</b>できます。</p>

    <h3 class="help-h3">画面の構成</h3>
    <ul>
      <li><b>左（PRESETS）</b>：カテゴリ（8BIT/REAL/UI/ENV）とプリセット一覧。選択で右側のエディタへ反映されます。</li>
      <li><b>中央（エディタ）</b>：OSCILLATOR / ENVELOPE(ADSR) / PITCH / FILTER / EFFECTS。波形選択・スライダーで現在の <span style="font-family:var(--mono)">state</span> を更新します。</li>
      <li><b>ARPEGGIATOR</b>：A で開始/停止。グリッドの各ステップに対して音程が生成されます。</li>
      <li><b>PITCH SEQUENCER</b>：P で表示切替。ON の場合は開始/停止も同時に制御されます。</li>
      <li><b>右（パネル）</b>：PLAY / EXPORT / RANDOMIZE / TEMP BOARD / OPTIONS（PSEQ 表示トグル等）。</li>
    </ul>

    <h3 class="help-h3">基本操作（マウス/タップ）</h3>
    <ul>
      <li>OSCILLATOR の波形ボタン（SQUARE/SINE/SAW/TRI/NOISE）をクリック。</li>
      <li>各スライダーで ADSR・フィルタ・FX 等を調整（値は画面ラベルと state に反映）。</li>
      <li>PLAY で単発の再生（または Space キーでも同様）。</li>
      <li>ARP/PSEQ の開始/停止ボタンを押す。</li>
      <li>プリセットを選択して現在の設定を切り替える。</li>
    </ul>

    <h3 class="help-h3">ショートカットキー</h3>
    <ul>
      <li><kbd class="kbd">Space</kbd>：再生 / （ARP/PSEQ が動作中なら）停止優先</li>
      <li><kbd class="kbd">R</kbd>：RANDOMIZE PARAMS</li>
      <li><kbd class="kbd">S</kbd>：PRESET MANAGER を開く</li>
      <li><kbd class="kbd">T</kbd>：TEMP BOARD に「現在の設定」を追加</li>
      <li><kbd class="kbd">C</kbd>：SE 比較（COMPARE）スロットに追加</li>
      <li><kbd class="kbd">A</kbd>：ARPEGGIATOR 開始/停止</li>
      <li><kbd class="kbd">P</kbd>：PITCH SEQUENCER の表示切替（必要なら開始/停止も連動）</li>
      <li><kbd class="kbd">Esc</kbd>：開いているモーダルを閉じ、必要に応じて ARP/PSEQ を停止</li>
    </ul>

    <h3 class="help-h3">TEMP BOARD（右のカード一覧）</h3>
    <ul>
      <li><b>＋ 現在を保存</b> または <kbd class="kbd">T</kbd>：現在の設定をカードとして保存。</li>
      <li><b>全消去</b>：カードをまとめて削除。</li>
      <li><b>ドラッグ&ドロップ</b>：カード順を並べ替え。</li>
      <li><b>カード名クリック</b>：カード名の編集（クリック後に編集欄にできます）。</li>
    </ul>

    <h3 class="help-h3">プリセット管理 / JSON</h3>
    <ul>
      <li><b>保存</b>：現在の設定を JSON として保存（IndexedDB を利用）。</li>
      <li><b>エクスポート</b>：すべて/単体を JSON でダウンロード。</li>
      <li><b>インポート</b>：JSON を読み込んでプリセットを復元。</li>
    </ul>

    <h3 class="help-h3">書き出し（WAV / OGG）</h3>
    <ul>
      <li><b>EXPORT WAV</b>：WAV を生成してダウンロード。</li>
      <li><b>EXPORT OGG</b>：録音（MediaRecorder）で OGG を生成してダウンロード。</li>
      <li>ARP/PSEQ を同時に鳴らしていると混在しやすいため、必要に応じて停止して書き出しされます。</li>
    </ul>

    <h3 class="help-h3">モバイル（狭い幅）の表示</h3>
    <p>画面幅が狭い場合、下部のタブで「プリセット / 編集 / ツール」を切り替えます。</p>

    <p style="margin-top:14px;color:var(--text3);font-size:11px;">
      もし挙動がおかしい場合：一度リロードしてください。音の書き出しは環境（ブラウザ設定、録音の許可など）に依存します。
    </p>`;
}

function _helpEn() {
  return `
    <h3 class="help-h3">What this tool does</h3>
    <p>Load parameters from presets on the left, adjust waveform / ADSR / filter / effects in the center editor, then <b>play</b> / <b>view waveform</b> / <b>export WAV/OGG</b>.</p>

    <h3 class="help-h3">Layout</h3>
    <ul>
      <li><b>Left (PRESETS)</b>: Categories (8BIT/REAL/UI/ENV) and preset list. Selecting one loads it into the editor.</li>
      <li><b>Center (Editor)</b>: OSCILLATOR / ENVELOPE (ADSR) / PITCH / FILTER / EFFECTS. Wave selection and sliders update the current <span style="font-family:var(--mono)">state</span>.</li>
      <li><b>ARPEGGIATOR</b>: Start/stop with <kbd class="kbd">A</kbd>. Each grid step generates a pitch.</li>
      <li><b>PITCH SEQUENCER</b>: Toggle visibility with <kbd class="kbd">P</kbd>. Start/stop is also controlled when toggled on.</li>
      <li><b>Right (Panel)</b>: PLAY / EXPORT / RANDOMIZE / TEMP BOARD / OPTIONS (PSEQ toggle, etc.).</li>
    </ul>

    <h3 class="help-h3">Basic Operation (Mouse / Touch)</h3>
    <ul>
      <li>Click waveform buttons in OSCILLATOR (SQUARE / SINE / SAW / TRI / NOISE).</li>
      <li>Adjust ADSR / filter / FX with sliders (values reflect in labels and state).</li>
      <li>PLAY for single playback (or press Space).</li>
      <li>Use start/stop buttons for ARP / PSEQ.</li>
      <li>Select a preset to switch current settings.</li>
    </ul>

    <h3 class="help-h3">Keyboard Shortcuts</h3>
    <ul>
      <li><kbd class="kbd">Space</kbd>: Play / Stop (if ARP/PSEQ is running, stop takes priority)</li>
      <li><kbd class="kbd">R</kbd>: Randomize params</li>
      <li><kbd class="kbd">S</kbd>: Open Preset Manager</li>
      <li><kbd class="kbd">T</kbd>: Add current settings to Temp Board</li>
      <li><kbd class="kbd">C</kbd>: Add to SE Compare slot</li>
      <li><kbd class="kbd">A</kbd>: Start / stop Arpeggiator</li>
      <li><kbd class="kbd">P</kbd>: Toggle Pitch Sequencer (start/stop linked if needed)</li>
      <li><kbd class="kbd">Esc</kbd>: Close open modals, stop ARP/PSEQ if needed</li>
    </ul>

    <h3 class="help-h3">TEMP BOARD (card list on the right)</h3>
    <ul>
      <li><b>＋ Save Current</b> or <kbd class="kbd">T</kbd>: Save current settings as a card.</li>
      <li><b>Clear All</b>: Delete all cards at once.</li>
      <li><b>Drag &amp; Drop</b>: Reorder cards.</li>
      <li><b>Click card name</b>: Edit the card name inline.</li>
    </ul>

    <h3 class="help-h3">Preset Management / JSON</h3>
    <ul>
      <li><b>Save</b>: Save current settings as JSON (stored in IndexedDB).</li>
      <li><b>Export</b>: Download all or individual presets as JSON.</li>
      <li><b>Import</b>: Load a JSON file to restore presets.</li>
    </ul>

    <h3 class="help-h3">Export (WAV / OGG)</h3>
    <ul>
      <li><b>EXPORT WAV</b>: Generate and download a WAV file.</li>
      <li><b>EXPORT OGG</b>: Record via MediaRecorder and download as OGG.</li>
      <li>If ARP/PSEQ is playing it may mix in — stop them before exporting if needed.</li>
    </ul>

    <h3 class="help-h3">Mobile (narrow screen)</h3>
    <p>On narrow screens use the bottom tabs to switch between Presets / Edit / Tools.</p>

    <p style="margin-top:14px;color:var(--text3);font-size:11px;">
      If something behaves unexpectedly, try reloading. Audio export depends on browser settings and recording permissions.
    </p>`;
}
