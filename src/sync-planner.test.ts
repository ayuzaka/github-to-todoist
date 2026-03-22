import {
  buildIssueUrlComment,
  extractIssueUrlFromDescription,
  formatDryRunPlan,
  formatTaskContent,
  parseRepositoryFromIssueUrl,
  parseTaskContent,
  planSync,
} from "./sync-planner.ts";
import { describe, expect, test } from "vitest";
import type { GitHubIssue } from "./github.ts";
import type { SyncPlan } from "./sync-planner.ts";
import type { TodoistTask } from "./todoist.ts";

const baseIssue: GitHubIssue = {
  id: "I_001",
  number: 1,
  title: "Test Issue",
  labels: ["backend"],
  state: "OPEN",
  updatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: "owner/repo",
  projectItemId: "Project_001",
  dueDate: null,
};

const baseTask: TodoistTask = {
  id: "task_001",
  content: "[#1] Test Issue",
  description: "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->",
  isCompleted: false,
  updatedAt: "2026-03-10T00:00:00Z",
  dueDate: null,
  labels: ["backend"],
};

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

describe(formatTaskContent, () => {
  test("Issue 番号とタイトルを [#番号] タイトル 形式でフォーマットする", () => {
    // Arrange
    const issue: GitHubIssue = { ...baseIssue, number: 42, title: "Fix the bug" };

    // Act
    const result = formatTaskContent(issue);

    // Assert
    expect(result).toBe("[#42] Fix the bug");
  });
});

describe(parseRepositoryFromIssueUrl, () => {
  test("GitHub Issue URL から owner/repo を抽出する", () => {
    // Act
    const result = parseRepositoryFromIssueUrl("https://github.com/owner/repo/issues/1");

    // Assert
    expect(result).toBe("owner/repo");
  });

  test("無効な URL の場合 null を返す", () => {
    // Act
    const result = parseRepositoryFromIssueUrl("https://example.com/not-a-github-url");

    // Assert
    expect(result).toBeNull();
  });

  test("空文字列の場合 null を返す", () => {
    // Act
    const result = parseRepositoryFromIssueUrl("");

    // Assert
    expect(result).toBeNull();
  });
});

describe(parseTaskContent, () => {
  test("[#番号] タイトル 形式から番号とタイトルを抽出する", () => {
    // Act
    const result = parseTaskContent("[#42] Fix the bug");

    // Assert
    expect(result).toStrictEqual({ number: 42, title: "Fix the bug" });
  });

  test("フォーマットに一致しない場合 null を返す", () => {
    // Act
    const result = parseTaskContent("Some random content");

    // Assert
    expect(result).toBeNull();
  });

  test("空文字列の場合 null を返す", () => {
    // Act
    const result = parseTaskContent("");

    // Assert
    expect(result).toBeNull();
  });
});

describe(formatDryRunPlan, () => {
  test("新規作成の Issue 情報を表示する", () => {
    // Arrange
    const plan: SyncPlan = {
      toCreate: [baseIssue],
      toUpdate: [],
      toDelete: [],
      toComplete: [],
      toSkip: 0,
    };

    // Act
    const result = formatDryRunPlan(plan);

    // Assert
    expect(result).toContain("1 create");
    expect(result).toContain("新規作成: owner/repo #1 Test Issue");
  });

  test("更新の Issue 情報を表示する", () => {
    // Arrange
    const plan: SyncPlan = {
      toCreate: [],
      toUpdate: [{ issue: { ...baseIssue, title: "Updated Title" }, task: baseTask }],
      toDelete: [],
      toComplete: [],
      toSkip: 0,
    };

    // Act
    const result = formatDryRunPlan(plan);

    // Assert
    expect(result).toContain("1 update");
    expect(result).toContain("更新: owner/repo #1 Updated Title");
  });

  test("削除の TodoistTask から Issue 情報をパースして表示する", () => {
    // Arrange
    const plan: SyncPlan = {
      toCreate: [],
      toUpdate: [],
      toDelete: [baseTask],
      toComplete: [],
      toSkip: 0,
    };

    // Act
    const result = formatDryRunPlan(plan);

    // Assert
    expect(result).toContain("1 delete");
    expect(result).toContain("削除: owner/repo #1 Test Issue");
  });

  test("完了の TodoistTask から Issue 情報をパースして表示する", () => {
    // Arrange
    const plan: SyncPlan = {
      toCreate: [],
      toUpdate: [],
      toDelete: [],
      toComplete: [baseTask],
      toSkip: 0,
    };

    // Act
    const result = formatDryRunPlan(plan);

    // Assert
    expect(result).toContain("1 complete");
    expect(result).toContain("完了: owner/repo #1 Test Issue");
  });

  test("パース不能な TodoistTask は content をそのまま表示する", () => {
    // Arrange
    const task: TodoistTask = { ...baseTask, content: "Manual task", description: "" };
    const plan: SyncPlan = {
      toCreate: [],
      toUpdate: [],
      toDelete: [task],
      toComplete: [],
      toSkip: 0,
    };

    // Act
    const result = formatDryRunPlan(plan);

    // Assert
    expect(result).toContain("削除: Manual task");
  });
});

describe(planSync, () => {
  test("タスクが存在しない OPEN Issue は toCreate に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [baseIssue];
    const tasks: readonly TodoistTask[] = [];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toCreate).toStrictEqual([baseIssue]);
    expect(result.toUpdate).toStrictEqual([]);
    expect(result.toSkip).toBe(0);
  });

  test("description URL が一致するタスクがありタイトルが異なる場合 toUpdate に追加する", () => {
    // Arrange
    const issue: GitHubIssue = { ...baseIssue, title: "Updated Title" };
    const issues: readonly GitHubIssue[] = [issue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]?.issue).toBe(issue);
    expect(result.toUpdate[0]?.task).toBe(baseTask);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("description URL が一致するタスクがあり期日が異なる場合 toUpdate に追加する", () => {
    // Arrange
    const issue: GitHubIssue = { ...baseIssue, dueDate: "2026-03-20" };
    const issues: readonly GitHubIssue[] = [issue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("タイトルも期日も同じ場合 toSkip にカウントする", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [baseIssue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toSkip).toBe(1);
    expect(result.toUpdate).toStrictEqual([]);
  });

  test("CLOSED Issue で対応タスクがある場合 toComplete に追加する", () => {
    // Arrange
    const closedIssue: GitHubIssue = { ...baseIssue, state: "CLOSED" };
    const issues: readonly GitHubIssue[] = [closedIssue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toComplete).toStrictEqual([baseTask]);
    expect(result.toUpdate).toStrictEqual([]);
  });

  test("CLOSED Issue で対応タスクがない場合はスキップする", () => {
    // Arrange
    const closedIssue: GitHubIssue = { ...baseIssue, state: "CLOSED" };
    const issues: readonly GitHubIssue[] = [closedIssue];
    const tasks: readonly TodoistTask[] = [];

    // Act
    const result: SyncPlan = planSync(issues, tasks);

    // Assert
    expect(result.toComplete).toStrictEqual([]);
    expect(result.toDelete).toStrictEqual([]);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("projectItemId が null の OPEN Issue で対応タスクがある場合 toDelete に追加する", () => {
    // Arrange
    const removedIssue: GitHubIssue = { ...baseIssue, projectItemId: null };
    const issues: readonly GitHubIssue[] = [removedIssue];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toDelete).toStrictEqual([baseTask]);
  });

  test("projectItemId が null の OPEN Issue で対応タスクがない場合はスキップする", () => {
    // Arrange
    const removedIssue: GitHubIssue = { ...baseIssue, projectItemId: null };
    const issues: readonly GitHubIssue[] = [removedIssue];
    const tasks: readonly TodoistTask[] = [];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toDelete).toStrictEqual([]);
  });

  test("どの Issue にも対応しない孤立タスクは toDelete に追加する", () => {
    // Arrange
    const issues: readonly GitHubIssue[] = [];
    const tasks: readonly TodoistTask[] = [baseTask];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toDelete).toStrictEqual([baseTask]);
  });

  test("description に URL がないタスクは孤立タスクとして toDelete に追加する", () => {
    // Arrange
    const taskWithoutUrl: TodoistTask = { ...baseTask, description: "no url here" };
    const issues: readonly GitHubIssue[] = [];
    const tasks: readonly TodoistTask[] = [taskWithoutUrl];

    // Act
    const result = planSync(issues, tasks);

    // Assert
    expect(result.toDelete).toStrictEqual([taskWithoutUrl]);
  });

  test("lastSyncedAt 以前に更新された Issue はスキップされる", () => {
    // Arrange
    const oldIssue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-10T00:00:00Z" };
    const issues: readonly GitHubIssue[] = [oldIssue];
    const tasks: readonly TodoistTask[] = [baseTask];
    const lastSyncedAt = "2026-03-15T00:00:00Z";

    // Act
    const result = planSync(issues, tasks, lastSyncedAt);

    // Assert
    expect(result.toSkip).toBe(1);
    expect(result.toUpdate).toStrictEqual([]);
    expect(result.toCreate).toStrictEqual([]);
  });

  test("lastSyncedAt より新しい Issue は通常通り処理される", () => {
    // Arrange
    const newIssue: GitHubIssue = {
      ...baseIssue,
      title: "Updated Title",
      updatedAt: "2026-03-20T00:00:00Z",
    };
    const issues: readonly GitHubIssue[] = [newIssue];
    const tasks: readonly TodoistTask[] = [baseTask];
    const lastSyncedAt = "2026-03-15T00:00:00Z";

    // Act
    const result = planSync(issues, tasks, lastSyncedAt);

    // Assert
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toSkip).toBe(0);
  });

  test("lastSyncedAt でフィルタされた Issue に対応するタスクは孤立タスクとして誤削除されない", () => {
    // Arrange
    const oldIssue: GitHubIssue = { ...baseIssue, updatedAt: "2026-03-10T00:00:00Z" };
    const issues: readonly GitHubIssue[] = [oldIssue];
    const tasks: readonly TodoistTask[] = [baseTask];
    const lastSyncedAt = "2026-03-15T00:00:00Z";

    // Act
    const result = planSync(issues, tasks, lastSyncedAt);

    // Assert
    expect(result.toDelete).toStrictEqual([]);
  });
});
