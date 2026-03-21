import { afterEach, describe, expect, test, vi } from "vitest";
import { getTask, mapTodoistTask } from "./todoist.ts";
import { TodoistApi } from "@doist/todoist-api-typescript";
import type { TodoistTask } from "./types.ts";

type Task = Parameters<typeof mapTodoistTask>[0];

const baseSdkTask: Task = {
  id: "task_1",
  userId: "user_1",
  projectId: "project_1",
  sectionId: null,
  parentId: null,
  addedByUid: null,
  assignedByUid: null,
  responsibleUid: null,
  content: "Test Task",
  description: "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->",
  checked: false,
  isDeleted: false,
  isCollapsed: false,
  isUncompletable: false,
  updatedAt: "2026-03-13T00:00:00Z",
  addedAt: "2026-03-01T00:00:00Z",
  completedAt: null,
  due: null,
  deadline: null,
  duration: null,
  labels: [],
  priority: 1,
  childOrder: 0,
  dayOrder: 0,
  url: "https://todoist.com/app/task/task_1",
};

describe(getTask, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("404 エラーの場合は null を返す", async () => {
    // Arrange
    const error = Object.assign(new Error("Not Found"), { httpStatusCode: 404 });
    vi.spyOn(TodoistApi.prototype, "getTask").mockRejectedValue(error);
    const api = new TodoistApi("token");

    // Act
    const result = await getTask(api, "task_1");

    // Assert
    expect(result).toBeNull();
  });

  test("404 以外のエラーは再スローする", async () => {
    // Arrange
    const error = Object.assign(new Error("Unauthorized"), { httpStatusCode: 401 });
    vi.spyOn(TodoistApi.prototype, "getTask").mockRejectedValue(error);
    const api = new TodoistApi("token");

    // Act & Assert
    await expect(getTask(api, "task_1")).rejects.toThrow("Unauthorized");
  });
});

describe(mapTodoistTask, () => {
  test("SDK Task を TodoistTask にマップする", () => {
    // Arrange
    const expected: TodoistTask = {
      id: "task_1",
      content: "Test Task",
      description: "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->",
      isCompleted: false,
      updatedAt: "2026-03-13T00:00:00Z",
      dueDate: null,
      labels: [],
    };

    // Act
    const result = mapTodoistTask(baseSdkTask);

    // Assert
    expect(result).toStrictEqual(expected);
  });

  test("due.date がある場合 dueDate に設定する", () => {
    // Arrange
    const task: Task = {
      ...baseSdkTask,
      due: {
        isRecurring: false,
        string: "Apr 1",
        date: "2026-04-01",
      },
    };

    // Act
    const result = mapTodoistTask(task);

    // Assert
    expect(result.dueDate).toBe("2026-04-01");
  });

  test("checked が true の場合 isCompleted は true", () => {
    // Arrange
    const task: Task = { ...baseSdkTask, checked: true };

    // Act
    const result = mapTodoistTask(task);

    // Assert
    expect(result.isCompleted).toBeTruthy();
  });

  test("updatedAt が null の場合 addedAt をフォールバックとして使用する", () => {
    // Arrange
    const task: Task = { ...baseSdkTask, updatedAt: null };

    // Act
    const result = mapTodoistTask(task);

    // Assert
    expect(result.updatedAt).toBe("2026-03-01T00:00:00Z");
  });

  test("labels 配列を正しくマップする", () => {
    // Arrange
    const task: Task = { ...baseSdkTask, labels: ["backend", "urgent"] };

    // Act
    const result = mapTodoistTask(task);

    // Assert
    expect(result.labels).toStrictEqual(["backend", "urgent"]);
  });
});
