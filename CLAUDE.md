@AGENTS.md

## Claude Code 固有事項

- **dev サーバは Claude 経由で起動すると刈られる（確定 2026-06-15）**: `run_in_background` でも `!npm run dev` でも、Claude のタスク管理に紐づくと数秒〜十数秒で `next dev` が graceful shutdown（exit 0）する。**ユーザ自身がタスクバーから独立ターミナルを開いて `npm run dev`** すれば刈られない（`start-dev.bat` も用意・gitignore 済み）。Claude 側で一時的に立てたい時は `explorer.exe start-dev.bat` でジョブから切り離す手もあるが不安定。**画面確認はヘッドレス Chrome（`chrome.exe --headless=new --screenshot`）を 1 コマンド内で「起動→撮影→停止」が確実**。dev では `middleware.ts` が全リクエストに `x-user-email`（`DEV_USER_EMAIL` 既定 `dev@example.com`）を付与するので curl でも API が通る

- **Claude 側で復旧する場合**: CDP（Chrome DevTools Protocol）ブラウザ自動化でダッシュボードを開き Resume をクリック → STATUS=Healthy を待つ、という手順が確立済み（2026-07-05 に実施）。Chrome 149 は既定プロファイルで `--remote-debugging-port` を塞ぐので、プロファイルを temp にコピーして別ポートで起動する。migration も同様に SQL Editor 経由で `window.monaco.editor.getModels()[0].setValue(sql)` + Ctrl+Enter で流せる（DB パスワード不要）
