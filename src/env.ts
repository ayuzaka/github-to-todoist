type AppEnv = {
  readonly githubToken: string;
  readonly githubProjectNumber: number;
  readonly githubProjectOwner: string;
  readonly todoistToken: string;
  readonly todoistProjectId: string;
  readonly githubProjectId: string | undefined;
  readonly githubDateFieldId: string | undefined;
};

export function getEnv(key: string): string | undefined {
  const value = process.env[key];
  return value === "" ? undefined : value;
}

function getRequiredEnv(key: string): string {
  const value = getEnv(key);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function validateEnv(): AppEnv {
  const githubToken = getRequiredEnv("GITHUB_TOKEN");
  const githubProjectOwner = getRequiredEnv("GITHUB_PROJECT_OWNER");
  const todoistToken = getRequiredEnv("TODOIST_TOKEN");
  const todoistProjectId = getRequiredEnv("TODOIST_PROJECT_ID");

  const projectNumberStr = getRequiredEnv("GITHUB_PROJECT_NUMBER");
  const githubProjectNumber = Number(projectNumberStr);
  if (!Number.isInteger(githubProjectNumber) || githubProjectNumber <= 0) {
    throw new Error("GITHUB_PROJECT_NUMBER must be a positive integer");
  }

  return {
    githubToken,
    githubProjectNumber,
    githubProjectOwner,
    todoistToken,
    todoistProjectId,
    githubProjectId: getEnv("GITHUB_PROJECT_ID"),
    githubDateFieldId: getEnv("GITHUB_DATE_FIELD_ID"),
  };
}
