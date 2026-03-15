import { describe, expect, test } from "vitest";
import type { TodoistTask } from "./types.js";
import { mapTodoistTask } from "./todoist.js";

type SdkTask = Parameters<typeof mapTodoistTask>[0];

const baseSdkTask: SdkTask = {
  id: "task_1",
  content: "Test Task",
  description: "<!-- github-to-todoist: https://github.com/owner/repo/issues/1 -->",
  checked: false,
  updatedAt: "2026-03-13T00:00:00Z",
  addedAt: "2026-03-01T00:00:00Z",
  due: null,
  labels: [],
};

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
    const task: SdkTask = {
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
    const task: SdkTask = { ...baseSdkTask, checked: true };
    // Act
    const result = mapTodoistTask(task);
    // Assert
    expect(result.isCompleted).toBeTruthy();
  });

  test("updatedAt が null の場合 addedAt をフォールバックとして使用する", () => {
    // Arrange
    const task: SdkTask = { ...baseSdkTask, updatedAt: null };
    // Act
    const result = mapTodoistTask(task);
    // Assert
    expect(result.updatedAt).toBe("2026-03-01T00:00:00Z");
  });

  test("labels 配列を正しくマップする", () => {
    // Arrange
    const task: SdkTask = { ...baseSdkTask, labels: ["backend", "urgent"] };
    // Act
    const result = mapTodoistTask(task);
    // Assert
    expect(result.labels).toStrictEqual(["backend", "urgent"]);
  });
});
