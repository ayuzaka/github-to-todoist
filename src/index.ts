import { createGitHubExec, getProjectItems } from "./github";
import { TodoistApi } from "@doist/todoist-api-typescript";
import { executeSyncPlan } from "./sync-executor";
import { getProjectTasks } from "./todoist";
import { planSync } from "./sync-planner";
import { validateEnv } from "./env";

async function sync(): Promise<void> {
  const env = validateEnv();

  const github = createGitHubExec(env.githubToken);
  const todoist = new TodoistApi(env.todoistToken);

  const [issues, tasks] = await Promise.all([
    getProjectItems(github, env.githubProjectOwner, env.githubProjectNumber),
    getProjectTasks(todoist, env.todoistProjectId),
  ]);

  const plan = planSync(issues, tasks);

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
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  await sync();
}
