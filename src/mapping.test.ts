import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Mapping, MappingCache } from "./types.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  findMappingByIssueId,
  findMappingByTaskId,
  getMappingFilePath,
  loadMappingCache,
  removeMapping,
  saveMappingCache,
  upsertMapping,
} from "./mapping.js";

vi.mock(import("node:fs/promises"));

const mockMapping: Mapping = {
  github_issue_id: "I_xxx",
  github_issue_number: 1,
  github_repo: "owner/repo",
  todoist_task_id: "123456789",
  last_synced_at: "2026-03-13T00:00:00Z",
};

describe(getMappingFilePath, () => {
  beforeEach(() => {
    delete process.env["MAPPING_FILE_PATH"];
    delete process.env["XDG_DATA_HOME"];
  });

  test("環境変数が設定されていない場合はデフォルトパスを返す", () => {
    // Arrange
    const expected = path.join(
      os.homedir(),
      ".local",
      "share",
      "github-to-todoist",
      "mapping.json",
    );
    // Act
    const result = getMappingFilePath();
    // Assert
    expect(result).toBe(expected);
  });

  test("MAPPING_FILE_PATH が設定されている場合はその値を返す", () => {
    // Arrange
    process.env["MAPPING_FILE_PATH"] = "/custom/path/mapping.json";
    // Act
    const result = getMappingFilePath();
    // Assert
    expect(result).toBe("/custom/path/mapping.json");
  });

  test("MAPPING_FILE_PATH が空文字の場合はデフォルトパスを返す", () => {
    // Arrange
    process.env["MAPPING_FILE_PATH"] = "";
    const expected = path.join(
      os.homedir(),
      ".local",
      "share",
      "github-to-todoist",
      "mapping.json",
    );
    // Act
    const result = getMappingFilePath();
    // Assert
    expect(result).toBe(expected);
  });

  test("XDG_DATA_HOME が設定されている場合はその値をベースに返す", () => {
    // Arrange
    process.env["XDG_DATA_HOME"] = "/custom/xdg";
    const expected = path.join("/custom/xdg", "github-to-todoist", "mapping.json");
    // Act
    const result = getMappingFilePath();
    // Assert
    expect(result).toBe(expected);
  });

  test("MAPPING_FILE_PATH が設定されている場合は XDG_DATA_HOME より優先される", () => {
    // Arrange
    process.env["MAPPING_FILE_PATH"] = "/explicit/path.json";
    process.env["XDG_DATA_HOME"] = "/custom/xdg";
    // Act
    const result = getMappingFilePath();
    // Assert
    expect(result).toBe("/explicit/path.json");
  });
});

describe(loadMappingCache, () => {
  test("ファイルが存在する場合はパースして返す", async () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(cache));
    // Act
    const result = await loadMappingCache("/some/path.json");
    // Assert
    expect(result).toStrictEqual(cache);
  });

  test("ファイルが存在しない場合は空キャッシュを返す", async () => {
    // Arrange
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    // Act
    const result = await loadMappingCache("/some/path.json");
    // Assert
    expect(result).toStrictEqual({ mappings: [] });
  });
});

describe(saveMappingCache, () => {
  test("ディレクトリを作成してファイルに書き込む", async () => {
    // Arrange
    vi.mocked(fs.mkdir).mockResolvedValue("");
    vi.mocked(fs.writeFile).mockResolvedValue();
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    await saveMappingCache("/some/dir/mapping.json", cache);
    // Assert
    expect(fs.mkdir).toHaveBeenCalledWith("/some/dir", { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/some/dir/mapping.json",
      JSON.stringify(cache, null, 2),
      "utf8",
    );
  });
});

describe(findMappingByIssueId, () => {
  test("一致する issue_id が存在する場合はそのマッピングを返す", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    const result = findMappingByIssueId(cache, "I_xxx");
    // Assert
    expect(result).toStrictEqual(mockMapping);
  });

  test("一致する issue_id が存在しない場合は undefined を返す", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    const result = findMappingByIssueId(cache, "I_not_found");
    // Assert
    expect(result).toBeUndefined();
  });
});

describe(findMappingByTaskId, () => {
  test("一致する task_id が存在する場合はそのマッピングを返す", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    const result = findMappingByTaskId(cache, "123456789");
    // Assert
    expect(result).toStrictEqual(mockMapping);
  });

  test("一致する task_id が存在しない場合は undefined を返す", () => {
    // Arrange
    const cache: MappingCache = { mappings: [] };
    // Act
    const result = findMappingByTaskId(cache, "999");
    // Assert
    expect(result).toBeUndefined();
  });
});

describe(upsertMapping, () => {
  test("既存エントリが存在しない場合は追加する", () => {
    // Arrange
    const cache: MappingCache = { mappings: [] };
    // Act
    const result = upsertMapping(cache, mockMapping);
    // Assert
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toStrictEqual(mockMapping);
  });

  test("既存エントリが存在する場合は上書きする", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    const updated: Mapping = { ...mockMapping, todoist_task_id: "new_id" };
    // Act
    const result = upsertMapping(cache, updated);
    // Assert
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]?.todoist_task_id).toBe("new_id");
  });

  test("元のキャッシュを変更しない（イミュータブル）", () => {
    // Arrange
    const cache: MappingCache = { mappings: [] };
    // Act
    upsertMapping(cache, mockMapping);
    // Assert
    expect(cache.mappings).toHaveLength(0);
  });
});

describe(removeMapping, () => {
  test("一致する issue_id のエントリを削除する", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    const result = removeMapping(cache, "I_xxx");
    // Assert
    expect(result.mappings).toHaveLength(0);
  });

  test("一致しない issue_id の場合は変更なし", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    const result = removeMapping(cache, "I_not_found");
    // Assert
    expect(result.mappings).toHaveLength(1);
  });

  test("元のキャッシュを変更しない（イミュータブル）", () => {
    // Arrange
    const cache: MappingCache = { mappings: [mockMapping] };
    // Act
    removeMapping(cache, "I_xxx");
    // Assert
    expect(cache.mappings).toHaveLength(1);
  });
});
