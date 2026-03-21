import { createGitHubExec, getProjectItems } from "./github";
import { getSyncStateFilePath, loadSyncState, saveSyncState } from "./sync-state";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { executeSyncPlan } from "./sync-executor";
import { getProjectTasks } from "./todoist";
import { planSync } from "./sync-planner";
import { validateEnv } from "./env";

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
    process.stdout.write(
      `[DRY RUN] Would sync: ${plan.toCreate.length} create, ${plan.toUpdate.length} update, ${plan.toDelete.length} delete, ${plan.toComplete.length} complete, ${plan.toSkip} skipped\n`,
    );
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
