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

export type SyncEntry = {
  readonly issue: GitHubIssue;
  readonly task: TodoistTask;
};

export type SyncPlan = {
  readonly toCreate: readonly GitHubIssue[];
  readonly toUpdate: readonly SyncEntry[];
  readonly toDelete: readonly TodoistTask[];
  readonly toComplete: readonly TodoistTask[];
  readonly toSkip: number;
};
