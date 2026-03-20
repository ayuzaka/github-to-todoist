import * as todoistOps from "./todoist";
import type { GitHubIssue, SyncPlan, TodoistTask } from "./types";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { SyncConfig } from "./sync-executor";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { executeSyncPlan } from "./sync-executor";

vi.mock(import("./todoist"));

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

const mockTodoist = new TodoistApi("mock-token");

describe(executeSyncPlan, () => {
  beforeEach(() => {
    vi.mocked(todoistOps.getOrCreateLabel).mockResolvedValue("owner/repo");
    vi.mocked(todoistOps.createTask).mockResolvedValue(baseTask);
    vi.mocked(todoistOps.addLabelToTask).mockResolvedValue();
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
      content: updatedIssue.title,
      dueDate: updatedIssue.dueDate,
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

  test("toSkip は result.skipped に反映される", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toSkip: 5 };

    // Act
    const result = await executeSyncPlan(plan, { todoist: mockTodoist, config });

    // Assert
    expect(result.skipped).toBe(5);
  });
});
