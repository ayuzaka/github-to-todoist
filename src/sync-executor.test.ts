import * as githubOps from "./github";
import * as todoistOps from "./todoist";
import type { GitHubIssue, Mapping, MappingCache, SyncPlan, TodoistTask } from "./types";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { GitHubExec } from "./github";
import type { SyncConfig } from "./sync-executor";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { executeSyncPlan } from "./sync-executor";
import { graphql } from "@octokit/graphql";

vi.mock(import("./todoist"));
vi.mock(import("./github"));

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

const config: SyncConfig = {
  githubProjectOwner: "owner",
  githubProjectNumber: 1,
  githubProjectId: "PVT_001",
  githubDateFieldId: "FIELD_001",
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
const mockGitHub: GitHubExec = graphql.defaults({ headers: {} });

describe(executeSyncPlan, () => {
  beforeEach(() => {
    vi.mocked(todoistOps.getOrCreateLabel).mockResolvedValue("owner/repo");
    vi.mocked(todoistOps.createTask).mockResolvedValue(baseTask);
    vi.mocked(todoistOps.addLabelToTask).mockResolvedValue();
    vi.mocked(todoistOps.updateTask).mockResolvedValue();
    vi.mocked(todoistOps.completeTask).mockResolvedValue();
    vi.mocked(todoistOps.deleteTask).mockResolvedValue();
    vi.mocked(githubOps.updateIssueTitle).mockResolvedValue();
    vi.mocked(githubOps.closeIssue).mockResolvedValue();
    vi.mocked(githubOps.updateProjectItemDate).mockResolvedValue();
  });

  test("toCreate: Todoist タスクを作成してキャッシュに追加する", async () => {
    // Arrange
    const newTask: TodoistTask = { ...baseTask, id: "task_new" };
    vi.mocked(todoistOps.createTask).mockResolvedValue(newTask);
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [baseIssue] };

    // Act
    const { result, updatedCache } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache: emptyCache,
      config,
    });

    // Assert
    expect(result.created).toBe(1);
    expect(updatedCache.mappings).toHaveLength(1);
    expect(updatedCache.mappings[0]?.todoist_task_id).toBe("task_new");
    expect(updatedCache.mappings[0]?.last_synced_at).toBe(baseIssue.createdAt);
  });

  test("toDelete: Todoist タスクを削除してキャッシュから除去する", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toDelete: [baseMapping] };
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const { result, updatedCache } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache,
      config,
    });

    // Assert
    expect(result.deleted).toBe(1);
    expect(updatedCache.mappings).toHaveLength(0);
    expect(vi.mocked(todoistOps.deleteTask)).toHaveBeenCalledWith(
      mockTodoist,
      baseMapping.todoist_task_id,
    );
  });

  test("toComplete: Todoist タスクを完了してキャッシュから除去する", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toComplete: [baseMapping] };
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const { result, updatedCache } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache,
      config,
    });

    // Assert
    expect(result.deleted).toBe(1);
    expect(updatedCache.mappings).toHaveLength(0);
    expect(vi.mocked(todoistOps.completeTask)).toHaveBeenCalledWith(
      mockTodoist,
      baseMapping.todoist_task_id,
    );
  });

  test("toUpdate github-to-todoist: Todoist タスクのタイトルと期日を更新する", async () => {
    // Arrange
    const plan: SyncPlan = {
      ...makeEmptyPlan(),
      toUpdate: [
        { mapping: baseMapping, issue: baseIssue, task: baseTask, direction: "github-to-todoist" },
      ],
    };
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const { result, updatedCache } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache,
      config,
    });

    // Assert
    expect(result.updated).toBe(1);
    expect(vi.mocked(todoistOps.updateTask)).toHaveBeenCalledWith(mockTodoist, baseTask.id, {
      content: baseIssue.title,
      dueDate: baseIssue.dueDate,
    });
    expect(updatedCache.mappings[0]?.last_synced_at).not.toBe(baseMapping.last_synced_at);
  });

  test("toUpdate todoist-to-github: GitHub Issue のタイトルを更新する", async () => {
    // Arrange
    const plan: SyncPlan = {
      ...makeEmptyPlan(),
      toUpdate: [
        { mapping: baseMapping, issue: baseIssue, task: baseTask, direction: "todoist-to-github" },
      ],
    };
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    const { result } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache,
      config,
    });

    // Assert
    expect(result.updated).toBe(1);
    expect(vi.mocked(githubOps.updateIssueTitle)).toHaveBeenCalledWith(
      mockGitHub,
      baseIssue.id,
      baseTask.content,
    );
  });

  test("toUpdate todoist-to-github: タスク完了時に GitHub Issue をクローズする", async () => {
    // Arrange
    const completedTask: TodoistTask = { ...baseTask, isCompleted: true };
    const plan: SyncPlan = {
      ...makeEmptyPlan(),
      toUpdate: [
        {
          mapping: baseMapping,
          issue: baseIssue,
          task: completedTask,
          direction: "todoist-to-github",
        },
      ],
    };
    const cache: MappingCache = { mappings: [baseMapping] };

    // Act
    await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache,
      config,
    });

    // Assert
    expect(vi.mocked(githubOps.closeIssue)).toHaveBeenCalledWith(mockGitHub, baseIssue.id);
  });

  test("エラー発生時は errors に記録して処理を続行する", async () => {
    // Arrange
    vi.mocked(todoistOps.createTask).mockRejectedValue(new Error("API error"));
    const plan: SyncPlan = { ...makeEmptyPlan(), toCreate: [baseIssue] };

    // Act
    const { result, updatedCache } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache: emptyCache,
      config,
    });

    // Assert
    expect(result.errors).toHaveLength(1);
    expect(result.created).toBe(0);
    expect(updatedCache.mappings).toHaveLength(0);
  });

  test("toSkip は result.skipped に反映される", async () => {
    // Arrange
    const plan: SyncPlan = { ...makeEmptyPlan(), toSkip: 5 };

    // Act
    const { result } = await executeSyncPlan(plan, {
      github: mockGitHub,
      todoist: mockTodoist,
      cache: emptyCache,
      config,
    });

    // Assert
    expect(result.skipped).toBe(5);
  });
});
