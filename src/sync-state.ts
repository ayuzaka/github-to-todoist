import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getEnv } from "./env";
import { homedir } from "node:os";

type SyncState = {
  readonly lastSyncedAt: string | null;
};

export function getSyncStateFilePath(): string {
  const override = getEnv("SYNC_STATE_FILE_PATH");
  if (override !== undefined) {
    return override;
  }

  const xdgDataHome = getEnv("XDG_DATA_HOME") ?? join(homedir(), ".local", "share");

  return join(xdgDataHome, "github-to-todoist", "sync-state.json");
}

export async function loadSyncState(filePath: string): Promise<SyncState> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: { lastSyncedAt?: unknown } = JSON.parse(raw);
    const { lastSyncedAt } = parsed;

    return { lastSyncedAt: typeof lastSyncedAt === "string" ? lastSyncedAt : null };
  } catch {
    return { lastSyncedAt: null };
  }
}

export async function saveSyncState(filePath: string, lastSyncedAt: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const state: SyncState = { lastSyncedAt };
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}
