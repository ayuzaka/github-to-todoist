import type { GitHubIssue, SyncPlan, TodoistTask } from "./types";
import { buildIssueUrlComment, extractIssueUrlFromDescription, planSync } from "./sync-planner";
import { describe, expect, test } from "vitest";

const baseIssue: GitHubIssue = {
  id: "I_001",
  number: 1,
  title: "Test Issue",
  state: "OPEN",
  updatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: "owner/repo",
  projectItemId: "Project_001",
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
});
