// se-ai-generator.js — AI SE Generator (LLM → Web Audio parameters)

import { state } from './se-state.js';
import { applyStateToUI } from './se-editor-ui.js';
import { playSE } from './se-audio-engine.js';
import { showToast } from './se-toast.js';

// ── サーバープロキシ状態 ───────────────────────────────────────────────────────
// null=未確認 / true=利用可能 / false=利用不可
let _proxyAvailable = null;
let _proxyChecking  = false; // 起動待ちポーリング中フラグ

// ── Storage keys ──────────────────────────────────────────────────────────────
const KEY_PROVIDER     = 'se-ai-provider';
const keyModel         = (p) => `se-ai-model-${p}`;
const apiKey           = (p) => `se-ai-key-${p}`;
const keyModelCache    = (p) => `se-ai-mcache-${p}`;
const keyModelCacheAt  = (p) => `se-ai-mcache-time-${p}`;
const MODEL_CACHE_TTL  = 24 * 60 * 60 * 1000; // 24時間

// ── Provider config ───────────────────────────────────────────────────────────
const PROVIDER_CONFIG = {
  google: {
    label:    'Google AI Studio (Gemini)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyHint:  'AIza...',
    models: [
      { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash ★推奨' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite（高速）' },
      { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro（高性能）' },
      { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash' },
    ],
  },
  groq: {
    label:    'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    keyHint:  'gsk_...',
    models: [
      { id: 'llama-3.3-70b-versatile',  label: 'Llama 3.3 70B ★推奨（無料）' },
      { id: 'llama-3.1-8b-instant',     label: 'Llama 3.1 8B（超高速・無料）' },
      { id: 'gemma2-9b-it',             label: 'Gemma2 9B（無料）' },
      { id: 'qwen-qwen3-32b',           label: 'Qwen3 32B（無料）' },
    ],
  },
  openai: {
    label:    'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    keyHint:  'sk-...',
    models: [
      { id: 'gpt-4o-mini',  label: 'GPT-4o Mini ★推奨（低コスト）' },
      { id: 'gpt-4o',       label: 'GPT-4o（高性能）' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano（最安）' },
    ],
  },
  anthropic: {
    label:    'Anthropic (Claude)',
    keyHint:  'sk-ant-...',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 ★推奨（低コスト）' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6（バランス）' },
      { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6（最高性能）' },
    ],
  },
  openrouter: {
    label:    'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    keyHint:  'sk-or-...',
    models: [
      { id: 'google/gemini-2.5-flash',            label: 'Gemini 2.5 Flash (Google)' },
      { id: 'meta-llama/llama-3.3-70b-instruct',  label: 'Llama 3.3 70B (Meta)' },
      { id: 'openai/gpt-4o-mini',                 label: 'GPT-4o Mini (OpenAI)' },
      { id: 'anthropic/claude-3.5-haiku',         label: 'Claude 3.5 Haiku (Anthropic)' },
      { id: 'qwen/qwen3-32b',                     label: 'Qwen3 32B (Alibaba)' },
    ],
  },
};

// ── Example prompts ───────────────────────────────────────────────────────────
const EXAMPLES = [
  '勇者がレベルアップする明るい8bit音',
  '敵を倒したときの爽快な斬撃音',
  'SF系レーザー銃の発射音',
  'コインを取得するキラキラした音',
  '魔法を詠唱する神秘的な音',
  'ゲームオーバーの悲しい音',
  '宝箱を開けるわくわくする音',
  '爆発の重厚な効果音',
  'メニュー選択のポップな音',
  '水中に潜るときのぼわっとした音',
];

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert sound designer specializing in game sound effects (SE) using Web Audio API synthesis.

The user will describe a sound effect in natural language (Japanese or English). Generate optimal synthesis parameters for that sound.

## Output Format
Return ONLY a valid JSON object — no markdown, no code fences, no explanation.

{
  "name": "日本語名（10文字以内）",
  "nameEn": "English name (max 20 chars)",
  "desc": "どんな音か一言で（日本語）",
  "wave": "square" | "sine" | "sawtooth" | "triangle" | "noise",
  "frequency": <20–2000, base pitch Hz>,
  "attack":    <1–2000, attack ms>,
  "decay":     <10–2000, decay ms>,
  "sustain":   <0.0–1.0, sustain level>,
  "release":   <10–3000, release ms>,
  "sweep":     <-800–800, pitch sweep Hz; positive=up, negative=down>,
  "cutoff":    <80–20000, low-pass cutoff Hz>,
  "resonance": <0.1–20, filter Q>,
  "distortion":<0–400, distortion amount>,
  "reverb":    <0–100, reverb mix %>,
  "vibrato":   <0–20, vibrato rate Hz>,
  "duration":  <50–5000, total sound ms>
}

## Wave Selection
- square   → 8-bit chiptune, retro, game bleeps
- sine     → smooth, clean UI tones, magic shimmer
- sawtooth → buzzy synth, electronic, sci-fi
- triangle → mellow, soft, flute-like
- noise    → explosions, impacts, wind, static, rain

## Sound Design Guidelines

**8-bit / chiptune** (jump, coin, level-up, shot):
- wave: square; frequency: 200–1000 Hz
- attack: 1ms; decay: 50–200ms; sustain: 0; short release
- sweep: positive for rising (jump/level-up), negative for falling (damage/shot)
- distortion: 0; reverb: 0–10; duration: 100–600ms

**Explosion / impact**:
- wave: noise; frequency: 50–200 Hz
- attack: 1–5ms; decay: 300–1000ms; sustain: 0.1–0.3; long release
- distortion: 100–400; reverb: 20–60; duration: 500–2000ms

**Magic / sparkle**:
- wave: sine or sawtooth; frequency: 500–1500 Hz
- attack: 50–300ms; sustain: 0.3–0.6; high resonance (3–10); reverb: 40–80
- vibrato: 5–15; duration: 800–2000ms

**UI (click, pop, notification)**:
- wave: sine; frequency: 400–1200 Hz; very short attack/decay; sustain: 0
- minimal reverb/distortion; duration: 50–300ms

**Ambient / environment**:
- wave: noise or sine; long attack (200–1000ms); long release; reverb: 50–90
- duration: 1000–5000ms

**Laser / shot**:
- wave: square or sawtooth; frequency: 400–1000 Hz
- fast attack; sweep: negative (falling); some distortion; duration: 100–300ms

## Built-in Preset Examples (reference)
- コイン:      {"wave":"square","frequency":880,"attack":1,"decay":80,"sustain":0,"release":60,"sweep":400,"cutoff":12000,"resonance":1,"distortion":0,"reverb":0,"vibrato":0,"duration":200}
- レベルアップ: {"wave":"square","frequency":330,"attack":1,"decay":80,"sustain":0.2,"release":100,"sweep":500,"cutoff":14000,"resonance":1,"distortion":0,"reverb":5,"vibrato":0,"duration":500}
- 爆発:        {"wave":"noise","frequency":80,"attack":5,"decay":800,"sustain":0.2,"release":1000,"sweep":-100,"cutoff":2000,"resonance":1,"distortion":300,"reverb":40,"vibrato":0,"duration":1500}
- 魔法詠唱:    {"wave":"sine","frequency":800,"attack":200,"decay":300,"sustain":0.5,"release":600,"sweep":200,"cutoff":16000,"resonance":5,"distortion":0,"reverb":70,"vibrato":12,"duration":1200}
- ジャンプ:    {"wave":"square","frequency":220,"attack":1,"decay":120,"sustain":0,"release":100,"sweep":600,"cutoff":12000,"resonance":1,"distortion":0,"reverb":0,"vibrato":0,"duration":300}

Always aim for crisp, recognizable, game-ready sounds.`;

// ── Module state ──────────────────────────────────────────────────────────────
let _lastResult = null;

// ── Public: open / close ──────────────────────────────────────────────────────
export function openAiGenerator() {
  const overlay = document.getElementById('aiGenOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _checkProxy(); // 非同期・結果を待たない（UIを止めないため）
  _restoreSettings();
  _showResult(null);
  _setStatus('');
}

export function closeAiGenerator() {
  document.getElementById('aiGenOverlay')?.classList.remove('open');
}

// ── Public: HTML event handlers (called via onclick) ─────────────────────────
export function aiGenOnProviderChange() {
  const provider = document.getElementById('aiGenProvider').value;
  const cfg      = PROVIDER_CONFIG[provider];
  if (!cfg) return;

  // Restore saved key
  const savedKey = localStorage.getItem(apiKey(provider)) || '';
  document.getElementById('aiGenApiKey').value = savedKey;
  _updateKeyPlaceholder(provider, savedKey);
  localStorage.setItem(KEY_PROVIDER, provider);

  // Load model list: キャッシュ優先、なければ組み込みリスト
  const cached = _loadModelCache(provider);
  _populateModelSelect(provider, cached || cfg.models);

  // キャッシュが古いか未取得なら、キーがあれば自動フェッチ
  const cacheAge = Date.now() - parseInt(localStorage.getItem(keyModelCacheAt(provider)) || '0');
  const hasKey   = !!localStorage.getItem(apiKey(provider));
  if (hasKey && (!cached || cacheAge > MODEL_CACHE_TTL)) {
    _fetchAndRefreshModels(provider);
  }
}

/** モデル一覧を手動リフレッシュ（更新ボタンから呼ぶ） */
export async function aiGenRefreshModels() {
  const provider = document.getElementById('aiGenProvider').value;
  const key      = document.getElementById('aiGenApiKey').value.trim();
  if (!key) { _setModelStatus('APIキーを入力してから更新してください', true); return; }
  // キーを一時保存してフェッチ
  localStorage.setItem(apiKey(provider), key);
  await _fetchAndRefreshModels(provider, true);
}

export function aiGenOnModelSelectChange() {
  const sel = document.getElementById('aiGenModel');
  _showCustomInput(sel.value === '_custom');
}

export function aiGenSetExample(text) {
  document.getElementById('aiGenPrompt').value = text;
  document.getElementById('aiGenPrompt').focus();
}

export async function aiGenGenerate() {
  const desc = document.getElementById('aiGenPrompt').value.trim();
  if (!desc) {
    _setStatus('説明を入力してください', true);
    document.getElementById('aiGenPrompt').focus();
    return;
  }

  _saveSettings();
  _showResult(null);
  _setStatus('生成中…');

  const btn = document.getElementById('aiGenBtn');
  btn.disabled = true;

  try {
    const raw    = await _callApi(desc);
    const result = _parseResult(raw);
    _showResult(result);
    _setStatus('生成完了！プレビューして適用してください');
  } catch (e) {
    _setStatus(`エラー: ${e.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

export function aiGenPreview() {
  if (!_lastResult) return;
  _applyToState(_lastResult);
  playSE();
}

export function aiGenApply() {
  if (!_lastResult) return;
  _applyToState(_lastResult);
  closeAiGenerator();
  showToast(`「${_lastResult.name || _lastResult.nameEn}」をエディタに適用しました`);
}

// ── Init: render example chips ─────────────────────────────────────────────
export function initAiGenerator() {
  const container = document.getElementById('aiGenExamples');
  if (!container) return;
  container.innerHTML = EXAMPLES.map(ex =>
    `<button class="ai-example-chip" data-ex="${ex.replace(/"/g, '&quot;')}">${ex}</button>`
  ).join('');
  // Use event delegation to avoid inline onclick with quoted strings
  container.addEventListener('click', e => {
    const chip = e.target.closest('.ai-example-chip');
    if (chip) aiGenSetExample(chip.dataset.ex);
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** キャッシュからモデルリストを読む（有効期限チェックなし、null なら未キャッシュ） */
function _loadModelCache(provider) {
  const raw = localStorage.getItem(keyModelCache(provider));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** モデル select を指定リストで再構築し、保存済み選択を復元 */
function _populateModelSelect(provider, models) {
  const sel        = document.getElementById('aiGenModel');
  const savedModel = localStorage.getItem(keyModel(provider)) || '';
  const inList     = models.find(m => m.id === savedModel);

  sel.innerHTML = models
    .map(m => `<option value="${m.id}"${m.id === savedModel ? ' selected' : ''}>${m.label}</option>`)
    .join('');
  // 末尾に手動入力オプションを追加
  sel.innerHTML += `<option value="_custom"${!inList && savedModel ? ' selected' : ''}>— カスタム入力 —</option>`;

  if (!inList && savedModel) {
    // 保存済みが一覧にない → カスタム選択状態でテキスト欄を表示
    _showCustomInput(true, savedModel);
  } else {
    _showCustomInput(false);
  }
}

/** カスタム入力欄の表示切り替え */
function _showCustomInput(show, value = '') {
  const el = document.getElementById('aiGenModelCustom');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (show && value) el.value = value;
}

/** プロバイダの /models エンドポイントを叩いてモデル一覧を取得・キャッシュ */
async function _fetchAndRefreshModels(provider, showFeedback = false) {
  const cfg = PROVIDER_CONFIG[provider];
  const key = localStorage.getItem(apiKey(provider)) || '';
  if (!cfg?.endpoint || !key) return;

  if (showFeedback) _setModelStatus('モデル一覧を取得中…');

  try {
    const res = await fetch(`${cfg.endpoint}/models`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // OpenAI 互換フォーマット: { data: [{id, ...}] }
    const raw = (json.data ?? json.models ?? [])
      .map(m => m.id ?? m)
      .filter(id => typeof id === 'string' && id.length > 0);

    const models = _filterModels(provider, raw);
    if (!models.length) throw new Error('モデルが見つかりませんでした');

    // キャッシュ保存
    localStorage.setItem(keyModelCache(provider), JSON.stringify(models));
    localStorage.setItem(keyModelCacheAt(provider), Date.now().toString());

    // ドロップダウン更新
    _populateModelSelect(provider, models);

    const date = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    if (showFeedback) _setModelStatus(`✓ ${models.length}件取得（${date}）`);
  } catch (e) {
    if (showFeedback) _setModelStatus(`取得失敗: ${e.message}`, true);
    // 失敗時は組み込みリストへフォールバック（既に表示済みならそのまま）
  }
}

/** プロバイダごとにモデルIDをフィルタリングして表示用オブジェクトに変換 */
function _filterModels(provider, ids) {
  // テキスト生成に無関係なモデルを除外するキーワード
  const EXCLUDE = /embed|tts|whisper|dall-e|moderat|vision-preview|instruct-preview|search|transcri/i;

  let filtered = ids.filter(id => !EXCLUDE.test(id));

  // プロバイダ別に更に絞り込み
  if (provider === 'openai') {
    // GPT 系のみ（fine-tune, legacy ft- 等を除外）
    filtered = filtered.filter(id => /^gpt-|^o\d/i.test(id) && !id.includes(':'));
  } else if (provider === 'google') {
    // Google API は "models/gemini-xxx" 形式で返すので接頭辞を除去してから絞り込む
    filtered = filtered
      .map(id => id.replace(/^models\//, ''))
      .filter(id => id.startsWith('gemini'));
  }

  // 組み込みリストで推奨マーク付きのものを先頭に並べる
  const builtinIds = (PROVIDER_CONFIG[provider]?.models ?? []).map(m => m.id);
  filtered.sort((a, b) => {
    const ai = builtinIds.indexOf(a), bi = builtinIds.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi; // 両方組み込み → 組み込み順
    if (ai !== -1) return -1;                    // a だけ組み込み → 前へ
    if (bi !== -1) return 1;                     // b だけ組み込み → 前へ
    return a.localeCompare(b);                   // それ以外 → 辞書順
  });

  return filtered.map(id => {
    const builtin = PROVIDER_CONFIG[provider]?.models.find(m => m.id === id);
    return { id, label: builtin ? builtin.label : id };
  });
}

/** サーバープロキシの有無を確認して _proxyAvailable を更新
 *  コールドスタート対応: 最大12回（約60秒）リトライ */
async function _checkProxy() {
  if (_proxyAvailable === true) return; // 確認済み（利用可能）
  if (_proxyChecking) return;           // 既にポーリング中
  _proxyChecking = true;

  const MAX_RETRY = 12;
  for (let i = 0; i <= MAX_RETRY; i++) {
    try {
      const res = await fetch('/api/proxy-available',
        { signal: AbortSignal.timeout(8000) });
      if (res.ok && (await res.json()).available === true) {
        _proxyAvailable = true;
        break;
      }
    } catch { /* タイムアウト or 接続拒否 → 起動中 */ }

    if (i < MAX_RETRY) {
      // モーダルが開いている間だけステータスを表示
      if (document.getElementById('aiGenOverlay')?.classList.contains('open')) {
        _setStatus('サーバー起動中… しばらくお待ちください');
      }
      await new Promise(r => setTimeout(r, 5000));
    } else {
      _proxyAvailable = false; // タイムアウト → 利用不可と判定
    }
  }

  _proxyChecking = false;

  // Groq 選択中なら UI を更新
  const provider = document.getElementById('aiGenProvider')?.value;
  if (provider === 'groq') {
    const savedKey = localStorage.getItem(apiKey(provider)) || '';
    _updateKeyPlaceholder(provider, savedKey);
    if (_proxyAvailable) _setStatus('');
  }
}

/** APIキー入力欄のプレースホルダーを状況に応じて設定 */
function _updateKeyPlaceholder(provider, currentValue) {
  const el = document.getElementById('aiGenApiKey');
  if (!el) return;
  const cfg = PROVIDER_CONFIG[provider];
  if (provider === 'groq' && !currentValue && _proxyAvailable) {
    el.placeholder = '（サーバー共用キー使用中 — 独自キーを入力すると上書きできます）';
  } else {
    el.placeholder = cfg?.keyHint || '';
  }
}

/** サーバープロキシ経由で Groq を呼び出す */
async function _callProxy(model, description) {
  let res;
  try {
    res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: description },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    // 接続できない = コールドスタート中
    throw new Error('サーバー起動中です。30秒ほど待ってから再試行してください');
  }
  if (res.status === 503) {
    throw new Error('サーバー起動中です。30秒ほど待ってから再試行してください');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || err?.error?.message || `API error ${res.status}`);
  }
  return (await res.json()).choices[0].message.content;
}

function _setModelStatus(msg, isError = false) {
  const el = document.getElementById('aiGenModelStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'var(--coral)' : 'var(--text3)';
}

function _restoreSettings() {
  const provider = localStorage.getItem(KEY_PROVIDER) || 'google';
  document.getElementById('aiGenProvider').value = provider;
  aiGenOnProviderChange(); // rebuilds model dropdown + restores key
}

function _saveSettings() {
  const provider = document.getElementById('aiGenProvider').value;
  const key      = document.getElementById('aiGenApiKey').value.trim();
  const selVal    = document.getElementById('aiGenModel').value;
  const customVal = document.getElementById('aiGenModelCustom').value.trim();
  const model     = selVal === '_custom' ? customVal : selVal;
  localStorage.setItem(KEY_PROVIDER, provider);
  if (key)   localStorage.setItem(apiKey(provider), key);
  if (model && model !== '_custom') localStorage.setItem(keyModel(provider), model);
}

function _setStatus(msg, isError = false) {
  const el = document.getElementById('aiGenStatus');
  if (!el) return;
  el.textContent = msg;
  el.className = 'ai-status' + (isError ? ' ai-status-error' : '');
}

async function _callApi(description) {
  const provider  = document.getElementById('aiGenProvider').value;
  const key       = document.getElementById('aiGenApiKey').value.trim();
  const selVal    = document.getElementById('aiGenModel').value;
  const customVal = document.getElementById('aiGenModelCustom').value.trim();
  const model     = selVal === '_custom' ? customVal : selVal;
  const cfg       = PROVIDER_CONFIG[provider];

  if (!model) throw new Error(selVal === '_custom' ? 'モデルIDを入力してください' : 'モデルを選択してください');

  // キー未入力の Groq → サーバープロキシ経由を試みる
  if (provider === 'groq' && !key) {
    if (_proxyAvailable === null) await _checkProxy();
    if (_proxyAvailable) return _callProxy(model, description);
  }

  const effectiveKey = key;
  if (!effectiveKey) throw new Error('APIキーを入力してください');

  // ── Anthropic (独自 API) ──────────────────────────────────────────────
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': effectiveKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
        max_tokens: 1024,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }
    return (await res.json()).content[0].text;
  }

  // ── OpenAI 互換 API (Google / Groq / OpenAI / OpenRouter) ────────────
  const base = cfg?.endpoint;
  if (!base) throw new Error('Unknown provider');

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${effectiveKey}`,
      ...(provider === 'openrouter' ? { 'HTTP-Referer': location.href } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: description },
      ],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${res.status}`);
  }
  return (await res.json()).choices[0].message.content;
}

function _parseResult(text) {
  // 1) markdown コードブロック内の JSON を優先抽出
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  // 2) それ以外は文字列中の最初の {...} を探す
  const jsonMatch  = blockMatch ? null : text.match(/\{[\s\S]*\}/);

  const raw = blockMatch ? blockMatch[1].trim()
            : jsonMatch  ? jsonMatch[0]
            : text.trim();

  const obj = JSON.parse(raw);

  // Clamp values to valid ranges
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  const VALID_WAVES = ['square', 'sine', 'sawtooth', 'triangle', 'noise'];

  return {
    name:        String(obj.name       || obj.nameEn || '生成SE'),
    nameEn:      String(obj.nameEn     || obj.name   || 'Generated SE'),
    desc:        String(obj.desc       || ''),
    wave:        VALID_WAVES.includes(obj.wave) ? obj.wave : 'square',
    frequency:   clamp(obj.frequency,   20,   2000),
    attack:      clamp(obj.attack,       1,   2000),
    decay:       clamp(obj.decay,       10,   2000),
    sustain:     clamp(obj.sustain,      0,      1),
    release:     clamp(obj.release,     10,   3000),
    sweep:       clamp(obj.sweep,     -800,    800),
    cutoff:      clamp(obj.cutoff,      80,  20000),
    resonance:   clamp(obj.resonance,  0.1,     20),
    distortion:  clamp(obj.distortion,   0,    400),
    reverb:      clamp(obj.reverb,       0,    100),
    vibrato:     clamp(obj.vibrato,      0,     20),
    duration:    clamp(obj.duration,    50,   5000),
  };
}

function _showResult(result) {
  const area = document.getElementById('aiGenResult');
  if (!area) return;

  if (!result) {
    _lastResult = null;
    area.style.display = 'none';
    return;
  }

  _lastResult = result;
  area.style.display = 'block';

  document.getElementById('aiGenResultName').textContent = result.name;
  document.getElementById('aiGenResultDesc').textContent = result.desc;

  const tags = [
    result.wave?.toUpperCase(),
    `${result.frequency}Hz`,
    `${(result.duration / 1000).toFixed(2)}s`,
    result.sweep  ? `sweep:${result.sweep}`   : null,
    result.reverb ? `rvb:${result.reverb}%`   : null,
    result.vibrato ? `vib:${result.vibrato}Hz` : null,
  ].filter(Boolean);

  document.getElementById('aiGenResultTags').innerHTML =
    tags.map(t => `<span class="ai-tag">${t}</span>`).join('');
}

function _applyToState(r) {
  Object.assign(state, {
    wave:       r.wave,
    frequency:  r.frequency,
    attack:     r.attack,
    decay:      r.decay,
    sustain:    r.sustain,
    release:    r.release,
    sweep:      r.sweep,
    cutoff:     r.cutoff,
    resonance:  r.resonance,
    distortion: r.distortion,
    reverb:     r.reverb,
    vibrato:    r.vibrato,
    duration:   r.duration,
  });
  applyStateToUI();
}
