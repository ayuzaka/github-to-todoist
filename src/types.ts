export type Mapping = {
  readonly github_issue_id: string;
  readonly github_issue_number: number;
  readonly github_repo: string;
  readonly todoist_task_id: string;
  readonly last_synced_at: string | null;
};

export type MappingCache = {
  readonly mappings: readonly Mapping[];
};

export type SyncResult = {
  readonly created: number;
  readonly updated: number;
  readonly deleted: number;
  readonly skipped: number;
  readonly errors: readonly string[];
};

export type GitHubIssue = {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly state: "OPEN" | "CLOSED";
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly repository: string;
  readonly projectItemId: string | null;
  readonly dueDate: string | null;
};

export type TodoistTask = {
  readonly id: string;
  readonly content: string;
  readonly description: string;
  readonly isCompleted: boolean;
  readonly updatedAt: string;
  readonly dueDate: string | null;
  readonly labels: readonly string[];
};

export type SyncDirection = "github-to-todoist" | "todoist-to-github" | "skip";

export type SyncEntry = {
  readonly mapping: Mapping;
  readonly issue: GitHubIssue;
  readonly task: TodoistTask;
  readonly direction: SyncDirection;
};

export type SyncPlan = {
  readonly toCreate: readonly GitHubIssue[];
  readonly toUpdate: readonly SyncEntry[];
  readonly toDelete: readonly Mapping[];
  readonly toComplete: readonly Mapping[];
  readonly toSkip: number;
};
