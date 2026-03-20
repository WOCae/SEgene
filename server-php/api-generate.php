<?php
/**
 * api-generate.php — Groq API プロキシ
 *
 * 自前サーバーに設置し、APIキーをサーバー側で管理する。
 * GitHub Pages (wocae.github.io) からのリクエストのみ受け付ける。
 *
 * 設置手順:
 *   1. GROQ_API_KEY を自分のキーに書き換える
 *   2. サーバーの任意のパスに配置（例: /api/api-generate.php）
 *   3. se-ai-generator.js の _callProxy / _checkProxy の URL を合わせる
 */

// ── 設定 ──────────────────────────────────────────────────────────────────────
define('GROQ_API_KEY',  'gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'); // ← 要変更
define('GROQ_ENDPOINT', 'https://api.groq.com/openai/v1/chat/completions');
define('ALLOWED_ORIGIN', 'https://wocae.github.io'); // ← GitHub Pages のドメイン

// 許可するモデルプレフィックス（Groq 以外のモデルへの中継を防ぐ）
const ALLOWED_PREFIXES = ['llama', 'gemma', 'qwen', 'mixtral', 'whisper'];

// ── CORS ──────────────────────────────────────────────────────────────────────
header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// プリフライトリクエスト（OPTIONS）はここで終了
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// POST のみ受け付ける
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ── リクエストボディ取得 ───────────────────────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true);
if (!$body) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

// ── モデル名バリデーション ────────────────────────────────────────────────────
$model = strtolower($body['model'] ?? '');
$allowed = false;
foreach (ALLOWED_PREFIXES as $prefix) {
    if (str_starts_with($model, $prefix)) {
        $allowed = true;
        break;
    }
}
if (!$allowed) {
    http_response_code(400);
    echo json_encode(['error' => "Model not allowed: {$model}"]);
    exit;
}

// ── Groq API へ転送 ───────────────────────────────────────────────────────────
$ch = curl_init(GROQ_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($body),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_HTTPHEADER     => [
        'Authorization: Bearer ' . GROQ_API_KEY,
        'Content-Type: application/json',
    ],
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => "Upstream connection failed: {$curlError}"]);
    exit;
}

http_response_code($httpCode);
echo $response;
