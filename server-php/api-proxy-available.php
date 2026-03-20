<?php
/**
 * api-proxy-available.php — プロキシ疎通確認エンドポイント
 *
 * クライアントがサーバープロキシの有無を確認するために使用する。
 * このファイルが存在してレスポンスを返せば available: true を返す。
 */

define('ALLOWED_ORIGIN', 'https://wocae.github.io'); // ← GitHub Pages のドメイン

header('Access-Control-Allow-Origin: ' . ALLOWED_ORIGIN);
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

echo json_encode(['available' => true]);
