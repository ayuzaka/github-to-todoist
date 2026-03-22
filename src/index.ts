import { createGitHubExec, getProjectItems } from "./github.ts";
import { formatDryRunPlan, planSync } from "./sync-planner.ts";
import { getSyncStateFilePath, loadSyncState, saveSyncState } from "./sync-state.ts";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { executeSyncPlan } from "./sync-executor.ts";
import { getProjectTasks } from "./todoist.ts";
import { validateEnv } from "./env.ts";

export async function sync(dryRun = false): Promise<void> {
  const env = validateEnv();

  const github = createGitHubExec(env.githubToken);
  const todoist = new TodoistApi(env.todoistToken);

  const syncStateFilePath = getSyncStateFilePath();
  const { lastSyncedAt } = await loadSyncState(syncStateFilePath);

  const [issues, tasks] = await Promise.all([
    getProjectItems(github, env.githubProjectOwner, env.githubProjectNumber),
    getProjectTasks(todoist, env.todoistProjectId),
  ]);

  const plan = planSync(issues, tasks, lastSyncedAt);

  if (dryRun) {
    process.stdout.write(formatDryRunPlan(plan));
    return;
  }

  const result = await executeSyncPlan(plan, {
    todoist,
    config: {
      githubProjectOwner: env.githubProjectOwner,
      githubProjectNumber: env.githubProjectNumber,
      todoistProjectId: env.todoistProjectId,
    },
  });

  process.stdout.write(
    `✓ Synced: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted, ${result.skipped} skipped\n`,
  );

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      process.stderr.write(`${err}\n`);
    }

    throw new Error(`Sync completed with ${result.errors.length} errors`);
  }

  await saveSyncState(syncStateFilePath, new Date().toISOString());
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  const dryRun = process.argv.includes("--dry-run");
  await sync(dryRun);
}
