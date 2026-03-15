export type Mapping = {
  github_issue_id: string;
  github_issue_number: number;
  github_repo: string;
  todoist_task_id: string;
  last_synced_at: string | null;
};

export type MappingCache = {
  mappings: Mapping[];
};

export type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

export type GitHubIssue = {
  id: string;
  number: number;
  title: string;
  state: "OPEN" | "CLOSED";
  updatedAt: string;
  createdAt: string;
  repository: string;
  projectItemId: string | null;
  dueDate: string | null;
};

export type TodoistTask = {
  id: string;
  content: string;
  description: string;
  isCompleted: boolean;
  updatedAt: string;
  dueDate: string | null;
  labels: string[];
};

export type SyncDirection = "github-to-todoist" | "todoist-to-github" | "skip";

export type SyncEntry = {
  mapping: Mapping;
  issue: GitHubIssue;
  task: TodoistTask;
  direction: SyncDirection;
};
