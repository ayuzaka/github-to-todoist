import { getMappingFilePath, loadMappingCache, saveMappingCache } from "./mapping";
import { createGitHubClient } from "./github";
import { createTodoistClient } from "./todoist";
import { executeSyncPlan } from "./sync-executor";
import { planSync } from "./sync-planner";
import { validateEnv } from "./env";

async function sync(): Promise<void> {
  const env = validateEnv();

  const github = createGitHubClient(env.githubToken);
  const todoist = createTodoistClient(env.todoistToken);
  const filePath = getMappingFilePath();
  const cache = await loadMappingCache(filePath);

  const [issues, tasks] = await Promise.all([
    github.getProjectItems(env.githubProjectOwner, env.githubProjectNumber),
    todoist.getProjectTasks(env.todoistProjectId),
  ]);

  const plan = planSync(issues, tasks, cache);

  const { result, updatedCache } = await executeSyncPlan(plan, {
    github,
    todoist,
    cache,
    config: {
      githubProjectOwner: env.githubProjectOwner,
      githubProjectNumber: env.githubProjectNumber,
      todoistProjectId: env.todoistProjectId,
      ...(env.githubProjectId !== undefined ? { githubProjectId: env.githubProjectId } : {}),
      ...(env.githubDateFieldId !== undefined ? { githubDateFieldId: env.githubDateFieldId } : {}),
    },
  });

  await saveMappingCache(filePath, updatedCache);

  process.stdout.write(
    `✓ Synced: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted, ${result.skipped} skipped\n`,
  );

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      process.stderr.write(`${err}\n`);
    }
    throw new Error(`Sync completed with ${result.errors.length} errors`);
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  await sync();
}
