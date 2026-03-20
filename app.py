"""
Game SE Tool — Hugging Face Spaces バックエンド
- /api/generate : Groq へのプロキシ（GROQ_API_KEY シークレットを使用）
- /             : 静的ファイル（HTML/JS/CSS）を配信
"""

import os
import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

GROQ_API_KEY  = os.environ.get("GROQ_API_KEY", "")
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

# 許可するモデル（Groq のモデルのみ。他プロバイダへの中継は行わない）
ALLOWED_MODEL_PREFIXES = ("llama", "gemma", "qwen", "mixtral", "whisper")


@app.post("/api/generate")
async def proxy_generate(request: Request):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Shared API key is not configured")

    body = await request.json()

    # モデル名の簡易バリデーション
    model = body.get("model", "")
    if not any(model.lower().startswith(p) for p in ALLOWED_MODEL_PREFIXES):
        raise HTTPException(status_code=400, detail=f"Model not allowed via proxy: {model}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            GROQ_ENDPOINT,
            json=body,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
        )

    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@app.get("/api/proxy-available")
async def proxy_available():
    """クライアントがサーバープロキシの有無を確認するためのエンドポイント"""
    return {"available": bool(GROQ_API_KEY)}


# 静的ファイルを最後にマウント（API ルートが優先される）
app.mount("/", StaticFiles(directory=".", html=True), name="static")
