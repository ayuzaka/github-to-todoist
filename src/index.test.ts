import * as github from "./github.ts";
import * as syncExecutor from "./sync-executor.ts";
import * as syncPlanner from "./sync-planner.ts";
import * as syncState from "./sync-state.ts";
import * as todoist from "./todoist.ts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SyncPlan } from "./types.ts";
import { sync } from "./index.ts";
import { validateEnv } from "./env.ts";

vi.mock(import("./github.ts"));
vi.mock(import("./sync-state.ts"));
vi.mock(import("./sync-executor.ts"));
vi.mock(import("./todoist.ts"));
vi.mock(import("./sync-planner.ts"));
vi.mock(import("@doist/todoist-api-typescript"));

const emptyPlan: SyncPlan = {
  toCreate: [],
  toUpdate: [],
  toDelete: [],
  toComplete: [],
  toSkip: 0,
};

describe(sync, () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "gh_token");
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "42");
    vi.stubEnv("GITHUB_PROJECT_OWNER", "owner");
    vi.stubEnv("TODOIST_TOKEN", "tod_token");
    vi.stubEnv("TODOIST_PROJECT_ID", "proj_001");

    vi.mocked(syncState.getSyncStateFilePath).mockReturnValue("/tmp/state.json");
    vi.mocked(syncState.loadSyncState).mockResolvedValue({ lastSyncedAt: null });
    vi.mocked(syncState.saveSyncState).mockResolvedValue();
    vi.mocked(github.getProjectItems).mockResolvedValue([]);
    vi.mocked(todoist.getProjectTasks).mockResolvedValue([]);
    vi.mocked(syncPlanner.planSync).mockReturnValue(emptyPlan);
    vi.mocked(syncExecutor.executeSyncPlan).mockResolvedValue({
      created: 0,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: [],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("--dry-run のとき executeSyncPlan を呼ばない", async () => {
    // Act
    await sync(true);

    // Assert
    expect(vi.mocked(syncExecutor.executeSyncPlan)).not.toHaveBeenCalled();
  });

  test("--dry-run のとき saveSyncState を呼ばない", async () => {
    // Act
    await sync(true);

    // Assert
    expect(vi.mocked(syncState.saveSyncState)).not.toHaveBeenCalled();
  });

  test("--dry-run のとき [DRY RUN] プレフィックスで操作件数を出力する", async () => {
    // Arrange
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.mocked(syncPlanner.planSync).mockReturnValue({
      ...emptyPlan,
      toCreate: [
        {
          id: "I_001",
          number: 1,
          title: "Test",
          labels: [],
          state: "OPEN",
          updatedAt: "2026-03-01T00:00:00Z",
          createdAt: "2026-03-01T00:00:00Z",
          repository: "owner/repo",
          projectItemId: "PI_001",
          dueDate: null,
        },
      ],
      toSkip: 3,
    });

    // Act
    await sync(true);

    // Assert
    expect(writeSpy).toHaveBeenCalledWith(
      "[DRY RUN] Would sync: 1 create, 0 update, 0 delete, 0 complete, 3 skipped\n",
    );

    writeSpy.mockRestore();
  });

  test("通常モードのとき executeSyncPlan と saveSyncState を呼ぶ", async () => {
    // Act
    await sync(false);

    // Assert
    expect(vi.mocked(syncExecutor.executeSyncPlan)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    );
    expect(vi.mocked(syncState.saveSyncState)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });
});

describe(validateEnv, () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "gh_token");
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "42");
    vi.stubEnv("GITHUB_PROJECT_OWNER", "owner");
    vi.stubEnv("TODOIST_TOKEN", "tod_token");
    vi.stubEnv("TODOIST_PROJECT_ID", "proj_001");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("全ての必須環境変数が揃っている場合、設定を返す", () => {
    // Act
    const result = validateEnv();

    // Assert
    expect(result.githubToken).toBe("gh_token");
    expect(result.githubProjectNumber).toBe(42);
    expect(result.githubProjectOwner).toBe("owner");
    expect(result.todoistToken).toBe("tod_token");
    expect(result.todoistProjectId).toBe("proj_001");
  });

  test("GITHUB_TOKEN が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_TOKEN", "");

    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_TOKEN");
  });

  test("GITHUB_PROJECT_NUMBER が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "");

    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_NUMBER");
  });

  test("GITHUB_PROJECT_OWNER が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_OWNER", "");

    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_OWNER");
  });

  test("TODOIST_TOKEN が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("TODOIST_TOKEN", "");

    // Act & Assert
    expect(() => validateEnv()).toThrow("TODOIST_TOKEN");
  });

  test("TODOIST_PROJECT_ID が未設定の場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("TODOIST_PROJECT_ID", "");

    // Act & Assert
    expect(() => validateEnv()).toThrow("TODOIST_PROJECT_ID");
  });

  test("GITHUB_PROJECT_NUMBER が数値でない場合エラーをスローする", () => {
    // Arrange
    vi.stubEnv("GITHUB_PROJECT_NUMBER", "not_a_number");

    // Act & Assert
    expect(() => validateEnv()).toThrow("GITHUB_PROJECT_NUMBER");
  });
});
