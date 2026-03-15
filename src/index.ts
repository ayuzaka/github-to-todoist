import { getMappingFilePath, loadMappingCache, saveMappingCache } from "./mapping.js";
import { createGitHubClient } from "./github.js";
import { createTodoistClient } from "./todoist.js";
import { executeSyncPlan } from "./sync-executor.js";
import { planSync } from "./sync-planner.js";

type EnvConfig = {
  readonly githubToken: string;
  readonly githubProjectNumber: number;
  readonly githubProjectOwner: string;
  readonly todoistToken: string;
  readonly todoistProjectId: string;
};

const getRequired = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const validateEnv = (): EnvConfig => {
  const githubToken = getRequired("GITHUB_TOKEN");
  const githubProjectOwner = getRequired("GITHUB_PROJECT_OWNER");
  const todoistToken = getRequired("TODOIST_TOKEN");
  const todoistProjectId = getRequired("TODOIST_PROJECT_ID");

  const projectNumberStr = getRequired("GITHUB_PROJECT_NUMBER");
  const githubProjectNumber = Number(projectNumberStr);
  if (!Number.isInteger(githubProjectNumber) || githubProjectNumber <= 0) {
    throw new Error("GITHUB_PROJECT_NUMBER must be a positive integer");
  }

  return { githubToken, githubProjectNumber, githubProjectOwner, todoistToken, todoistProjectId };
};

const sync = async (): Promise<void> => {
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

  const githubProjectId = process.env["GITHUB_PROJECT_ID"];
  const githubDateFieldId = process.env["GITHUB_DATE_FIELD_ID"];

  const { result, updatedCache } = await executeSyncPlan(plan, {
    github,
    todoist,
    cache,
    config: {
      githubProjectOwner: env.githubProjectOwner,
      githubProjectNumber: env.githubProjectNumber,
      todoistProjectId: env.todoistProjectId,
      ...(githubProjectId !== undefined && githubProjectId !== "" ? { githubProjectId } : {}),
      ...(githubDateFieldId !== undefined && githubDateFieldId !== "" ? { githubDateFieldId } : {}),
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
};

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  await sync();
}
