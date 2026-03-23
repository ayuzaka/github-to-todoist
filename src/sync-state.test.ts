import { describe, expect, test, vi } from "vitest";
import { getSyncStateFilePath, loadSyncState, saveSyncState } from "./sync-state.ts";
import { mkdir, readFile, writeFile } from "node:fs/promises";

vi.mock(import("node:fs/promises"));

describe(getSyncStateFilePath, () => {
  test("XDG_DATA_HOME が未設定の場合はデフォルトパスを返す", () => {
    // Arrange
    vi.stubEnv("SYNC_STATE_FILE_PATH", "");
    vi.stubEnv("XDG_DATA_HOME", "");

    // Act
    const result = getSyncStateFilePath();

    // Assert
    expect(result).toContain(".local/share/github-to-todoist/sync-state.json");
  });

  test("XDG_DATA_HOME が設定されている場合はその値をベースに返す", () => {
    // Arrange
    vi.stubEnv("SYNC_STATE_FILE_PATH", "");
    vi.stubEnv("XDG_DATA_HOME", "/custom/data");

    // Act
    const result = getSyncStateFilePath();

    // Assert
    expect(result).toBe("/custom/data/github-to-todoist/sync-state.json");
  });

  test("SYNC_STATE_FILE_PATH が設定されている場合はその値を優先する", () => {
    // Arrange
    vi.stubEnv("SYNC_STATE_FILE_PATH", "/override/sync-state.json");

    // Act
    const result = getSyncStateFilePath();

    // Assert
    expect(result).toBe("/override/sync-state.json");
  });
});

describe(loadSyncState, () => {
  test("ファイルが存在しない場合は lastSyncedAt: null を返す", async () => {
    // Arrange
    vi.mocked(readFile).mockRejectedValue(new Error("ENOENT"));

    // Act
    const result = await loadSyncState("/path/sync-state.json");

    // Assert
    expect(result).toStrictEqual({ lastSyncedAt: null });
  });

  test("ファイルが存在する場合はパースして返す", async () => {
    // Arrange
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ lastSyncedAt: "2026-03-21T10:00:00.000Z" }),
    );

    // Act
    const result = await loadSyncState("/path/sync-state.json");

    // Assert
    expect(result).toStrictEqual({ lastSyncedAt: "2026-03-21T10:00:00.000Z" });
  });
});

describe(saveSyncState, () => {
  test("ディレクトリを作成してファイルに書き込む", async () => {
    // Arrange
    vi.mocked(mkdir).mockResolvedValue("");
    vi.mocked(writeFile).mockResolvedValue();

    // Act
    await saveSyncState("/path/sync-state.json", "2026-03-21T10:00:00.000Z");

    // Assert
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith("/path", { recursive: true });
    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      "/path/sync-state.json",
      JSON.stringify({ lastSyncedAt: "2026-03-21T10:00:00.000Z" }, null, 2),
      "utf8",
    );
  });
});
