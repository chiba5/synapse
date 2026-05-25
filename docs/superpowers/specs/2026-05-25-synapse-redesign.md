# Synapse Redesign Spec
2026-05-25

## 1. Synapse とは何か

**Claude Code が中身、Synapse が外面。**

Synapse は Claude Code が生成した情報を映す「外部脳ディスプレイ」と、チバ・蓮がリアルタイムに連携する「コミュニケーション層」の2つで構成される。Synapse 自体に画期的な機能はなく、Claude が統合されていること・データを自己保有できること・二人の運用に完全フィットすることが他ツールとの差別化要因。

### Synapse を使う理由（他ツールを使わない理由）
- **Claude 統合**: Discord・Obsidian は Claude API を組み込めない
- **二人専用フィット**: 汎用ツールの余分な機能・合わない UI を排除できる
- **ハブとしての一元化**: 他ツールが Synapse に集まる中心として機能する
- **データ自己保有**: 外部 SaaS に依存せず自分たちの DB にデータを置く

### 何を Synapse に入力するか
- **主経路**: Claude Code スキル（wrap-up 等）が自動で書き出す
- **例外**: チャット（人間同士のリアルタイム通信）
- 手動入力 UI は最小限。「Synapse に直接書く」場面は少ない

---

## 2. IA（ページ構成）

| ページ | 状態 | 内容 |
|---|---|---|
| `/` ホーム | 改善 | 高精度ニュース上位 3 件 + Ren 未読メッセージ数 + TODO サマリ（CC ブリッジ後） |
| `/chat` | **新規★最優先** | チバ ↔ 蓮 リアルタイムチャット + ファイル共有 |
| `/morning` | 改善 | 高精度ニュースフィード（ソース・フィルタ刷新） |
| `/projects` | 将来 | wrap-up が書き出したプロジェクト進捗ログ |
| `/notes` | 現行維持 | 手動メモ（将来 Claude が整理） |
| `/daily-reports` | 廃止検討 | CC ブリッジ後に /projects へ統合 |

---

## 3. チャット機能設計 `/chat`

### 目的
Discord の代替。チバ ↔ 蓮のリアルタイムメッセージ + ファイル共有。

### データモデル
```sql
channels (id, name, created_at)
-- 初期: "general" 1 本のみ。将来複数チャンネル対応。

messages (id, channel_id, sender_email, body, file_url, file_name, file_size, created_at)
```

### リアルタイム方式
Supabase Realtime（INSERT イベントを subscribe）。追加サービス・コスト 0。2 人なので負荷なし。

### ファイル共有
- `POST /api/chat/upload` → R2 に保存 → 署名付き URL を messages に記録
- 画像: インライン表示 / その他: ダウンロードリンク
- サイズ上限: 10 MB

### UI 構成
- 左サイドバー: チャンネルリスト（初期は general のみ）
- メインエリア: メッセージ一覧（自分は右寄せ、相手は左寄せ）+ 入力欄 + 添付ボタン

### 通知
- Phase 1: ホーム画面に「未読 N 件」バッジのみ
- 将来: Web Push 通知 / PWA バッジ

### 車輪の再発明検討結果
Stream Chat 等の既製品は「データが外部サーバーに行く」ためデータ自己保有原則と矛盾。Supabase Realtime での実装（約 250 行）が最適。

---

## 4. ニュース精度改善 `/morning`

### 問題
現行の Morning フィード: 情報が古い・興味から遠い・「今日試したい」と思わせない。

### フィルタリング基準（2 ティア制）

| ティア | 定義 | 収集 |
|---|---|---|
| **戦略変わる** | これが出たことで「今まで不可能だったことが可能になる」 | ✅ |
| **今日試せる** | 今日コマンドを打てる / 設定を変えられる / ツールを入れられる | ✅ |
| その他 | 一般知識・解説・考察・多くの人が読むべき情報 | ❌ DB に入れない |

**判定例（@ClaudeCode_love 投稿ベース）:**
- `/usage` コマンド追加 → 今日試せる ✅
- Fast mode デフォルトが Opus 4.7 に変更 → 今日試せる ✅
- Agent memory で無限 memory 実装手法 → 戦略変わる ✅
- 「AI 時代は context と知識管理が成功の 9 割」→ 一般論 ❌

### ソース（X のみ・将来拡張可）

| 優先度 | アカウント / クエリ |
|---|---|
| ★★★ | @ClaudeCode_love（週次アップデート・実務手法） |
| ★★★ | @AnthropicAI / @ClaudeAI（公式リリース） |
| ★★ | Claude コミュニティ著名アカウント（随時追加） |
| ★ | OpenAI / Google 公式（モデルリリース・API 変更のみ） |

RSS / WebSearch は当面不採用。重要情報は必ず X に出るため。

### synapse-agent プロンプト改善

```
以下の基準で判定し、どちらでもなければ DB に入れるな:
[今日試せる] 今日からコマンドを打てる / 設定を変えられる / ツールを入れられる
[戦略変わる] これが出たことで「今まで不可能だったことが可能になる」
該当する場合は sandbox_context (what / how / why) も生成せよ
```

### sandbox パス
`sandbox_context` フィールド（what / how / why）を agent が生成。Synapse 上の「試す準備」ボタンでクリップボードにコピー → Claude Code sandbox にペーストできる状態に。自動実行は将来の試行依頼ジョブとして処理。

---

## 5. 将来フェーズ（概念メモ）

### Claude Code → Synapse ブリッジ（Phase 3）
- wrap-up スキルが実行時に Supabase API を呼び出してプロジェクト進捗を書き出す
- `/projects` ページで表示。手動日報入力は廃止
- 進捗は「一つのファイルが書き換わり続ける」形（ログ蓄積ではなく最新状態 + 差分）

### PM / 自己管理（Phase 4）
- プロジェクトごとの状態・TODO を Synapse に表示
- チバ・蓮のプロジェクト進捗をクロスで参照できる
- 自己管理サポート（習慣・目標）の UI は設計未着手

### 蓮の対称化（Phase 5）
- 蓮も自分の Claude Code から Synapse に書き出せるように
- まず Ren の Claude Code オンボーディングハブとして Synapse を使う

---

## 6. ロードマップ

```
Phase 1: /chat 実装（チャット + ファイル共有）  ← 最優先
Phase 2: ニュース精度改善（ソース刷新 + フィルタ + sandbox パス）
Phase 3: Claude Code → Synapse ブリッジ（wrap-up 自動書き出し）
Phase 4: PM / 自己管理 UI
Phase 5: 蓮の対称化・オンボーディング
```

---

## 7. 既存実装の扱い

| 機能 | 扱い |
|---|---|
| `/morning` 現行フィード | ソース・フィルタ・プロンプトを Phase 2 で刷新 |
| `/daily-reports` | Phase 3 完了後に廃止検討、/projects に統合 |
| `/notes` | 現行維持。将来 Claude が整理 |
| synapse-agent collect | X のみに絞り込み、プロンプト刷新 |
| `claude_runnable` フラグ | `sandbox_context` フィールドを追加して拡張 |
