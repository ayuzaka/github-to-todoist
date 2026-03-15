import type {
  GitHubIssue,
  Mapping,
  MappingCache,
  SyncDirection,
  SyncPlan,
  TodoistTask,
} from "./types";
import {
  buildIssueUrlComment,
  determineSyncDirection,
  extractIssueUrlFromDescription,
  planSync,
} from "./sync-planner";
import { describe, expect, test } from "vitest";

const baseIssue: GitHubIssue = {
  id: "I_001",
  number: 1,
  title: "Test Issue",
  state: "OPEN",
  updatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: "owner/repo",
  projectItemId: "PVTI_001",
  dueDate: null,
};

const baseTask: TodoistTask = {
  id: "task_001",
  content: "Test Issue",
  description: "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->",
  isCompleted: false,
  updatedAt: "2026-03-10T00:00:00Z",
  dueDate: null,
  labels: [],
};

const baseMapping: Mapping = {
  github_issue_id: "I_001",
  github_issue_number: 1,
  github_repo: "owner/repo",
  todoist_task_id: "task_001",
  last_synced_at: "2026-03-12T00:00:00Z",
};

const emptyCache: MappingCache = { mappings: [] };

describe(extractIssueUrlFromDescription, () => {
  test("有効なコメントから URL を抽出する", () => {
    // Arrange
    const description = "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->";

    // Act
    const result = extractIssueUrlFromDescription(description);

    // Assert
    expect(result).toBe("https://github.com/owner/repo/issues/1");
  });

  test("空文字列の場合 null を返す", () => {
    // Act
    const result = extractIssueUrlFromDescription("");

    // Assert
    expect(result).toBeNull();
  });

  test("コメントがない場合 null を返す", () => {
    // Act
    const result = extractIssueUrlFromDescription("Some random text");

    // Assert
    expect(result).toBeNull();
  });

  test("他のテキストと混在していても URL を抽出する", () => {
    // Arrange
    const description =
      "Some text\n<!-- github-to-todoist: https://github.com/owner/repo/issues/42 -->\nmore text";

    // Act
    const result = extractIssueUrlFromDescription(description);

    // Assert
    expect(result).toBe("https://github.com/owner/repo/issues/42");
  });
});

describe(buildIssueUrlComment, () => {
  test("GitHub Issue URL から HTML コメントを生成する", () => {
    // Arrange
    const url = "https://github.com/owner/repo/issues/1";

    // Act
    const result = buildIssueUrlComment(url);

    // Assert
    expect(result).toBe("<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->");
  });
});

describe(determineSyncDirection, () => {
  test("GitHub のみ更新後に更新されている場合 github-to-todoist", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-12T00:00:00Z" };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-13T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-10T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("github-to-todoist");
  });

  test("Todoist のみ更新後に更新されている場合 todoist-to-github", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-12T00:00:00Z" };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-10T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-13T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("todoist-to-github");
  });

  test("両方更新（競合）で GitHub が新しい場合 github-to-todoist", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-10T00:00:00Z" };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-13T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-12T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("github-to-todoist");
  });

  test("両方更新（競合）で Todoist が新しい場合 todoist-to-github", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-10T00:00:00Z" };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-12T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-13T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("todoist-to-github");
  });

  test("両方更新（競合）で同時刻の場合 GitHub が勝つ（タイブレーク）", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-10T00:00:00Z" };
    const sameTime = "2026-03-13T00:00:00Z";
    const issue: GitHubIssue = { ...baseIssue, updatedAt: sameTime };
    const task: TodoistTask = { ...baseTask, updatedAt: sameTime };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("github-to-todoist");
  });

  test("どちらも更新なしの場合 skip", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-14T00:00:00Z" };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-10T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-10T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("skip");
  });

  test("last_synced_at が null の場合 競合として LWW を適用する", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: null };
    const issue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-13T00:00:00Z" };
    const task: TodoistTask = { ...baseTask, updatedAt: "2026-03-12T00:00:00Z" };

    // Act
    const result = determineSyncDirection(mapping, issue, task);

    // Assert
    expect(result).toBe<SyncDirection>("github-to-todoist");
  });
});

describe(planSync, () => {
  test("キャッシュにない Issue は toCreate に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [baseIssue];
    const tasks: readonly TodoistTask[] = [];

    // Act
    const result = planSync(issues, tasks, emptyCache);

    // Assert
    expect(result.toCreate).toStrictEqual([baseIssue]);
    expect(result.toUpdate).toStrictEqual([]);
    expect(result.toSkip).toBe(0);
  });

  test("キャッシュにある Issue でタスクが見つかる場合 toUpdate に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [{ ...baseIssue, updatedAt: "2026-03-13T00:00:00Z" }];
    const tasks: readonly TodoistTask[] = [{ ...baseTask, updatedAt: "2026-03-10T00:00:00Z" }];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]?.direction).toBe<SyncDirection>("github-to-todoist");
    expect(result.toCreate).toStrictEqual([]);
  });

  test("更新なしのペアは toSkip にカウントする", () => {
    // Arrange
    const mapping: Mapping = { ...baseMapping, last_synced_at: "2026-03-14T00:00:00Z" };
    const issues: readonly GitHubIssue[] = [{ ...baseIssue, updatedAt: "2026-03-10T00:00:00Z" }];
    const tasks: readonly TodoistTask[] = [{ ...baseTask, updatedAt: "2026-03-10T00:00:00Z" }];
    const cache: MappingCache = { mappings: [mapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toSkip).toBe(1);
    expect(result.toUpdate).toStrictEqual([]);
  });

  test("キャッシュにある Issue でタスクが削除済みの場合 toDelete に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [baseIssue];
    const tasks: readonly TodoistTask[] = [];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result: SyncPlan = planSync(issues, tasks, cache);

    // Assert
    expect(result.toDelete).toStrictEqual([baseMapping]);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("CLOSED な Issue のマッピングは toComplete に追加する", () => {
    // Arrange
    const closedIssue: GitHubIssue = { ...baseIssue, state: "CLOSED" };
    const issues: readonly GitHubIssue[] = [closedIssue];
    const tasks: readonly TodoistTask[] = [baseTask];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toComplete).toStrictEqual([baseMapping]);
    expect(result.toUpdate).toStrictEqual([]);
  });

  test("projectItemId が null の OPEN Issue（プロジェクトから削除）は toDelete に追加する", () => {
    // Arrange
    const removedIssue: GitHubIssue = { ...baseIssue, projectItemId: null };
    const issues: readonly GitHubIssue[] = [removedIssue];
    const tasks: readonly TodoistTask[] = [baseTask];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toDelete).toStrictEqual([baseMapping]);
  });

  test("キャッシュにない Issue でタスク description に URL が一致する場合 toUpdate に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [baseIssue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks, emptyCache);

    // Assert
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("CLOSED Issue でタスクが削除済みの場合 toDelete に追加する", () => {
    // Arrange
    const closedIssue: GitHubIssue = { ...baseIssue, state: "CLOSED" };
    const issues: readonly GitHubIssue[] = [closedIssue];
    const tasks: readonly TodoistTask[] = [];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toDelete).toStrictEqual([baseMapping]);
    expect(result.toComplete).toStrictEqual([]);
  });

  test("issues リストに含まれないマッピングでタスクが削除済みの場合 toDelete に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [];
    const tasks: readonly TodoistTask[] = [];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toDelete).toStrictEqual([baseMapping]);
  });

  test("issues リストに含まれないマッピングでタスクが存在する場合はスキップする", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [];
    const tasks: readonly TodoistTask[] = [baseTask];
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const result = planSync(issues, tasks, cache);

    // Assert
    expect(result.toDelete).toStrictEqual([]);
    expect(result.toComplete).toStrictEqual([]);
    expect(result.toSkip).toBe(0);
  });
});
