# TODO: GitHub ↔ Todoist 同期システム実装

SPEC: `.agents/plans/feat-sync-todoist-github/SPEC.md`

## Section 1: 型定義・データモデル

- [x] `src/types.ts` に以下の型を定義する
  - `Mapping` (github_issue_id, github_issue_number, github_repo, todoist_task_id, last_synced_at)
  - `MappingCache` ({ mappings: Mapping[] })
  - `SyncResult` (created, updated, deleted, skipped, errors)
  - `GitHubIssue` (id, number, title, state, updatedAt, repository, projectItemId, dueDate)
  - `TodoistTask` (id, content, description, isCompleted, updatedAt, due, labels)
  - `SyncDirection` (union: "github-to-todoist" | "todoist-to-github" | "skip")
  - `SyncEntry` (mapping?, issue, task?, direction)
- [x] 型定義のユニットテスト不要（型のみ）

## Section 2: マッピングキャッシュ管理

- [x] `src/mapping.ts` を実装する
  - `getMappingFilePath(): string` — 環境変数 `MAPPING_FILE_PATH` or `~/.local/share/github-to-todoist/mapping.json`
  - `loadMappingCache(): Promise<MappingCache>` — ファイル読み込み。存在しなければ空キャッシュを返す
  - `saveMappingCache(cache: MappingCache): Promise<void>` — ファイル保存（ディレクトリ自動作成）
  - `findMappingByIssueId(cache: MappingCache, issueId: string): Mapping | undefined`
  - `findMappingByTaskId(cache: MappingCache, taskId: string): Mapping | undefined`
  - `upsertMapping(cache: MappingCache, mapping: Mapping): MappingCache`
  - `removeMapping(cache: MappingCache, issueId: string): MappingCache`
- [x] `src/mapping.test.ts` を TDD で実装する

## Section 3: GitHub クライアント（抽象層）

- [ ] `src/github.ts` を実装する（`@octokit/graphql` の薄い抽象層）
  - `createGitHubClient(token: string): GitHubClient` — クライアントファクトリ
  - `GitHubClient.getProjectItems(owner: string, projectNumber: number): Promise<GitHubIssue[]>` — Project (v2) の全 OPEN Issue + Date フィールドを取得
  - `GitHubClient.getIssue(owner: string, repo: string, issueNumber: number): Promise<GitHubIssue>` — 単体 Issue 取得
  - `GitHubClient.updateIssueTitle(issueId: string, title: string): Promise<void>`
  - `GitHubClient.closeIssue(issueId: string): Promise<void>`
  - `GitHubClient.reopenIssue(issueId: string): Promise<void>`
  - `GitHubClient.updateProjectItemDate(projectId: string, itemId: string, fieldId: string, date: string | null): Promise<void>` — Date フィールド更新
- [ ] `src/github.test.ts` を TDD で実装する（vitest の vi.mock で @octokit/graphql をモック）

## Section 4: Todoist クライアント（抽象層）

- [ ] `src/todoist.ts` を実装する（`@doist/todoist-api-typescript` の薄い抽象層）
  - `createTodoistClient(token: string): TodoistClient` — クライアントファクトリ
  - `TodoistClient.getProjectTasks(projectId: string): Promise<TodoistTask[]>` — プロジェクト全タスク取得
  - `TodoistClient.getTask(taskId: string): Promise<TodoistTask | null>` — 単体タスク取得（存在しなければ null）
  - `TodoistClient.createTask(projectId: string, params: CreateTaskParams): Promise<TodoistTask>` — タスク作成
  - `TodoistClient.updateTask(taskId: string, params: UpdateTaskParams): Promise<void>` — タスク更新（title, due）
  - `TodoistClient.completeTask(taskId: string): Promise<void>`
  - `TodoistClient.deleteTask(taskId: string): Promise<void>`
  - `TodoistClient.getOrCreateLabel(name: string): Promise<string>` — ラベル ID を返す
  - `TodoistClient.addLabelToTask(taskId: string, labelId: string): Promise<void>` — 既存ラベルを保持して追加
  - `CreateTaskParams` 型: { content, description, dueDate?, labelIds?, projectId }
  - `UpdateTaskParams` 型: { content?, dueDate? }
- [ ] `src/todoist.test.ts` を TDD で実装する（@doist/todoist-api-typescript をモック）

## Section 5: 同期ロジック（取得・比較フェーズ）

- [ ] `src/sync-planner.ts` を実装する
  - `extractIssueUrlFromDescription(description: string): string | null` — description から GitHub Issue URL を抽出
  - `buildIssueUrlComment(issueUrl: string): string` — `<!-- github-to-todoist: URL -->` 形式を生成
  - `determineSyncDirection(mapping: Mapping, issue: GitHubIssue, task: TodoistTask): SyncDirection` — LWW ロジック
    - `last_synced_at` 以降の更新有無を判定
    - 両方更新あり（競合）→ 新しい updatedAt を持つ側が優先。同一なら GitHub 優先
    - GitHub のみ更新 → "github-to-todoist"
    - Todoist のみ更新 → "todoist-to-github"
    - どちらも未更新 → "skip"
  - `planSync(issues: GitHubIssue[], tasks: TodoistTask[], cache: MappingCache): SyncPlan` — エントリ一覧と新規作成・削除・完了候補を返す
    - `SyncPlan` 型: { toCreate: GitHubIssue[], toUpdate: SyncEntry[], toDelete: Mapping[], toComplete: Mapping[], toSkip: number }
- [ ] `src/sync-planner.test.ts` を TDD で実装する

## Section 6: 同期ロジック（書き込みフェーズ）

- [ ] `src/sync-executor.ts` を実装する
  - `executeSyncPlan(plan: SyncPlan, github: GitHubClient, todoist: TodoistClient, cache: MappingCache, config: SyncConfig): Promise<{ result: SyncResult; updatedCache: MappingCache }>` — 書き込み実行
    - `toCreate`: Todoist タスク作成 → description に URL 埋め込み → キャッシュ追加 → last_synced_at を issue.createdAt で初期化
    - `toUpdate`: direction に応じて GitHub or Todoist を更新 → 両方成功時のみ last_synced_at 更新
    - `toDelete`: Todoist タスク削除 → キャッシュ削除
    - `toComplete`: Todoist タスク完了 → キャッシュ削除
    - GitHub と Todoist への書き込みを Promise.allSettled で並列実行
    - 失敗エントリは SyncResult.errors に記録して続行
  - `SyncConfig` 型: { githubProjectOwner, githubProjectNumber, todoistProjectId }
- [ ] `src/sync-executor.test.ts` を TDD で実装する

## Section 7: CLI エントリポイント

- [ ] `src/index.ts` を実装する
  - 環境変数バリデーション（GITHUB_TOKEN, GITHUB_PROJECT_NUMBER, GITHUB_PROJECT_OWNER, TODOIST_TOKEN, TODOIST_PROJECT_ID）
  - `sync` コマンドの実装
    - フェーズ1: GitHub/Todoist からデータ取得 → planSync
    - フェーズ2: executeSyncPlan（並列書き込み）
    - キャッシュ保存
    - サマリ出力: `✓ Synced: X created, Y updated, Z deleted, W skipped`
    - エラーがあれば stderr に出力
  - process.exit(1) でエラー終了
- [ ] `src/index.test.ts` を TDD で実装する（env バリデーションのみ）
