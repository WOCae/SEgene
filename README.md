# Game SE Tool (SEgene)

ブラウザ上でゲーム向け SE を合成・試聴・書き出しする静的ツールです。

## ドキュメント

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — ファイル構成・データフロー・改修の目印（`// ──` セクション境界など）

## ローカルで動かす

ES modules のため **`file://` 直開きは非推奨**です。ローカルサーバーで開いてください。

```bash
npx --yes serve .
```

表示された URL を開き、`/game-se-tool.html` にアクセスします。

## GitHub にリポジトリを作って push する

このマシンに [GitHub CLI](https://cli.github.com/) が入っていない場合は、ウェブから作成するのが簡単です。

1. GitHub で [**New repository**](https://github.com/new) を開く
2. **Repository name** を入力（例: `SEgene`）。**Add a README** はオフにする（ローカルに既にあるため）
3. **Create repository** 後、HTTPS または SSH の URL をコピーする

**初回のみ**（`<USER>` / `<REPO>` を置き換え）:

```bash
cd /path/to/SEgene
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

既に `origin` がある場合は `git remote set-url origin ...` で差し替えてください。SSH の場合は `git@github.com:<USER>/<REPO>.git` を使います。

### GitHub CLI を使う場合

```bash
gh auth login
gh repo create <REPO> --private --source=. --remote=origin --push
```

`--public` にすれば公開リポジトリになります。
