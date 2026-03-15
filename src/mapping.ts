import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Mapping, MappingCache } from "./types";

const isMappingCache = (value: unknown): value is MappingCache => {
  return (
    typeof value === "object" &&
    value !== null &&
    "mappings" in value &&
    Array.isArray(value.mappings)
  );
};

export const getMappingFilePath = (): string => {
  const custom = process.env["MAPPING_FILE_PATH"];
  if (custom !== undefined && custom !== "") {
    return custom;
  }
  const xdgDataHome = process.env["XDG_DATA_HOME"];
  const dataDir =
    xdgDataHome !== undefined && xdgDataHome !== ""
      ? xdgDataHome
      : path.join(os.homedir(), ".local", "share");
  return path.join(dataDir, "github-to-todoist", "mapping.json");
};

export const loadMappingCache = async (filePath: string): Promise<MappingCache> => {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(content);
    if (!isMappingCache(parsed)) {
      throw new TypeError("Invalid mapping cache format");
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { mappings: [] };
    }
    throw error;
  }
};

export const saveMappingCache = async (filePath: string, cache: MappingCache): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(cache, null, 2), "utf8");
};

export const findMappingByIssueId = (cache: MappingCache, issueId: string): Mapping | undefined => {
  return cache.mappings.find((m) => m.github_issue_id === issueId);
};

export const findMappingByTaskId = (cache: MappingCache, taskId: string): Mapping | undefined => {
  return cache.mappings.find((m) => m.todoist_task_id === taskId);
};

export const upsertMapping = (cache: MappingCache, mapping: Mapping): MappingCache => {
  const existing = cache.mappings.findIndex((m) => m.github_issue_id === mapping.github_issue_id);
  if (existing === -1) {
    return { mappings: [...cache.mappings, mapping] };
  }
  const updated = [...cache.mappings];
  updated[existing] = mapping;
  return { mappings: updated };
};

export const removeMapping = (cache: MappingCache, issueId: string): MappingCache => {
  return {
    mappings: cache.mappings.filter((m) => m.github_issue_id !== issueId),
  };
};
