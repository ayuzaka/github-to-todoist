# GitHub to Todoist

GitHub Projects (v2) の Issue を Todoist タスクへ同期する CLI ツール。
GitHub の変更を Todoist に反映し、タスク管理を一元化できます。

## 同期されるフィールド

| GitHub                      | Todoist        |
| --------------------------- | -------------- |
| Issue タイトル              | タスクタイトル |
| Projects の Date プロパティ | 期日           |
| Issue 状態（OPEN/CLOSED）   | タスク完了状態 |
| リポジトリ名                | ラベル         |

## 前提条件

- Node.js 24 以上
- pnpm
- GitHub Personal Access Token（`repo` スコープ + Projects read 権限）
- Todoist API トークン
- 同期先の Todoist プロジェクトが作成済みであること

## セットアップ

```sh
pnpm install
```

## 環境変数

| 変数名                  | 必須 | 説明                                                                                                     |
| ----------------------- | :--: | -------------------------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`          |  ✅  | GitHub Personal Access Token                                                                             |
| `GITHUB_PROJECT_OWNER`  |  ✅  | Project のオーナー名（org または user）                                                                  |
| `GITHUB_PROJECT_NUMBER` |  ✅  | GitHub Project の番号（URL の `/projects/N` の N）                                                       |
| `TODOIST_TOKEN`         |  ✅  | Todoist API トークン（[設定画面](https://app.todoist.com/app/settings/integrations/developer) から取得） |
| `TODOIST_PROJECT_ID`    |  ✅  | 同期先 Todoist プロジェクトの ID                                                                         |
| `SYNC_STATE_FILE_PATH`  |  ❌  | 同期状態ファイルの保存先（デフォルト: `~/.local/share/github-to-todoist/sync-state.json`）               |

## 使い方

```sh
node --env-file=.env src/index.ts
```

### ビルド後に実行

```sh
pnpm build
node dist/index.js
```

### cron による定期実行（例: 15分ごと）

```cron
*/15 * * * * node --env-file=/path/to/.env /path/to/dist/index.js >> /var/log/github-to-todoist.log 2>&1
```

### Dry Run

`--dry-run` オプションを付けると、実際の変更を行わずに同期内容をプレビューできます。

```sh
node --env-file=.env src/index.ts --dry-run
```

```sh
[DRY RUN] Would sync: 3 create, 2 update, 1 delete, 0 complete, 10 skipped
```

### 開発用（ファイル変更を監視して再実行）

```sh
pnpm dev
```

## 実行結果の例

```sh
✓ Synced: 3 created, 2 updated, 1 deleted, 10 skipped
```

## 仕組み

1. **取得フェーズ**: GitHub Project の Issue 一覧と Todoist タスク一覧を並列取得
2. **比較フェーズ**: Todoist タスクの description に埋め込まれた GitHub Issue URL をキーにマッピングし、各ペアの同期要否を判定
3. **書き込みフェーズ**: 作成・更新・完了・削除を並列実行
4. **状態保存フェーズ**: 最終同期時刻を `sync-state.json` に保存し、次回実行時は Issue 本体または同期対象の GitHub Projects フィールド更新との差分同期に使用

## 開発

```sh
pnpm test          # テスト実行
pnpm test:watch    # テスト監視
pnpm typecheck     # 型チェック
pnpm lint          # Lint
pnpm lint:fix      # Lint（自動修正）
pnpm format        # フォーマットチェック
pnpm format:fix    # フォーマット修正
```
