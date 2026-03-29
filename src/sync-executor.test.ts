import * as TodoistSdk from "@doist/todoist-api-typescript";
import * as todoistOps from "./todoist.ts";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { executeSyncPlan } from "./sync-executor.ts";

type SyncPlan = Parameters<typeof executeSyncPlan>[0];
type SyncConfig = Parameters<typeof executeSyncPlan>[1]["config"];
type GitHubIssue = SyncPlan["toCreate"][number];
type TodoistTask = SyncPlan["toDelete"][number];

vi.mock(import("./todoist.ts"));

const baseIssue: GitHubIssue = {
  id: "I_001",
  number: 1,
  title: "Test Issue",
  labels: ["backend"],
  state: "OPEN",
  updatedAt: "2026-03-13T00:00:00Z",
  syncUpdatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: "owner/repo",
  projectItemId: "ProjectItem_001",
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

const config: SyncConfig = {
  githubProjectOwner: "owner",
  githubProjectNumber: 1,
  todoistProjectId: "proj_001",
};

function makeEmptyPlan(): SyncPlan {
  return {
    toCreate: [],
    toUpdate: [],
    toDelete: [],
    toComplete: [],
    toSkip: 0,
  };
}

const mockTodoist = new TodoistSdk.TodoistApi("mock-token");

describe(executeSyncPlan, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(todoistOps.getOrCreateSection).mockResolvedValue("section_001");
    vi.mocked(todoistOps.createTask).mockResolvedValue(baseTask);
    vi.mocked(todoistOps.updateTask).mockResolvedValue();
    vi.mocked(todoistOps.completeTask).mockResolvedValue();
    vi.mocked(todoistOps.deleteTask).mockResolvedValue();
  });

  test("toCreate: Todoist タスクを作成する", async () => {
    // Arrange
    const newTask: TodoistTask = { ...baseTask, id: "task_new" };
    vi.mocked(todoistOps.createTask).mockResolvedValue(newTask);
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [baseIssue] };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.created).toBe(1);
  });

  test("toDelete: Todoist タスクを削除する", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toDelete: [baseTask] };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.deleted).toBe(1);
    expect(vi.mocked(todoistOps.deleteTask)).toHaveBeenCalledWith(mockTodoist, baseTask.id);
  });

  test("toComplete: Todoist タスクを完了する", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toComplete: [baseTask] };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.deleted).toBe(1);
    expect(vi.mocked(todoistOps.completeTask)).toHaveBeenCalledWith(mockTodoist, baseTask.id);
  });

  test("toUpdate: Todoist タスクのタイトルと期日を更新する", async () => {
    // Arrange
    const updatedIssue: GitHubIssue = {
      ...baseIssue,
      title: "Updated Title",
      labels: ["backend", "urgent"],
      dueDate: "2026-03-25",
    };
    const plan: SyncPlan = {
      ...makeEmptyPlan(),
      toUpdate: [{ issue: updatedIssue, task: baseTask }],
    };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.updated).toBe(1);
    expect(vi.mocked(todoistOps.updateTask)).toHaveBeenCalledWith(mockTodoist, baseTask.id, {
      content: "[#1] Updated Title",
      dueDate: updatedIssue.dueDate,
      labels: updatedIssue.labels,
    });
  });

  test("エラー発生時は errors に記録して処理を続行する", async () => {
    // Arrange
    vi.mocked(todoistOps.createTask).mockRejectedValue(new Error("API error"));
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [baseIssue] };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.errors).toHaveLength(1);
    expect(result.created).toBe(0);
  });

  test("同一リポジトリの Issue が複数あってもセクションは1回だけ作成される", async () => {
    // Arrange
    const issue1: GitHubIssue = { ...baseIssue, id: "I_001", number: 1 };
    const issue2: GitHubIssue = { ...baseIssue, id: "I_002", number: 2 };
    const issue3: GitHubIssue = { ...baseIssue, id: "I_003", number: 3 };
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [issue1, issue2, issue3] };

    // Act
    await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(vi.mocked(todoistOps.getOrCreateSection)).toHaveBeenCalledOnce();
  });

  test("異なるリポジトリの Issue はリポジトリごとにセクションを作成する", async () => {
    // Arrange
    vi.mocked(todoistOps.getOrCreateSection)
      .mockResolvedValueOnce("section_repo_a")
      .mockResolvedValueOnce("section_repo_b");
    const issueA: GitHubIssue = {
      ...baseIssue,
      id: "I_001",
      number: 1,
      repository: "owner/repo-a",
    };
    const issueB: GitHubIssue = {
      ...baseIssue,
      id: "I_002",
      number: 2,
      repository: "owner/repo-b",
    };
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [issueA, issueB] };

    // Act
    await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(vi.mocked(todoistOps.getOrCreateSection)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(todoistOps.createTask)).toHaveBeenCalledWith(
      mockTodoist,
      config.todoistProjectId,
      expect.objectContaining({ sectionId: "section_repo_a" }),
    );
    expect(vi.mocked(todoistOps.createTask)).toHaveBeenCalledWith(
      mockTodoist,
      config.todoistProjectId,
      expect.objectContaining({ sectionId: "section_repo_b" }),
    );
  });

  test("セクション作成失敗時は該当リポジトリの全 Issue がエラーになり他の操作は続行される", async () => {
    // Arrange
    vi.mocked(todoistOps.getOrCreateSection).mockRejectedValue(new Error("Section API error"));
    const issue1: GitHubIssue = { ...baseIssue, id: "I_001", number: 1 };
    const issue2: GitHubIssue = { ...baseIssue, id: "I_002", number: 2 };
    const plan: SyncPlan = {
      ...makeEmptyPlan(),
      toCreate: [issue1, issue2],
      toDelete: [{ ...baseTask, id: "task_del" }],
    };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.includes("Section API error"))).toBeTruthy();
    expect(vi.mocked(todoistOps.createTask)).not.toHaveBeenCalled();
    expect(vi.mocked(todoistOps.deleteTask)).toHaveBeenCalledWith(mockTodoist, "task_del");
    expect(result.deleted).toBe(1);
  });

  test("toSkip は result.skipped に反映される", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toSkip: 5 };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.skipped).toBe(5);
  });
});
