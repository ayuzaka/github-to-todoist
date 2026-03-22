import type { GitHubIssue, SyncEntry, SyncPlan, TodoistTask } from "./types.ts";

export function extractIssueUrlFromDescription(description: string): string | null {
  const match = /<!-- github-to-todoist: (https?:\/\/[^\s]+) -->/.exec(description);
  return match?.[1] ?? null;
}

export function buildIssueUrlComment(issueUrl: string): string {
  return `<!-- github-to-todoist: ${issueUrl} -->`;
}

export function formatTaskContent(issue: GitHubIssue): string {
  return `[#${issue.number}] ${issue.title}`;
}

function hasContentDiff(issue: GitHubIssue, task: TodoistTask): boolean {
  return formatTaskContent(issue) !== task.content || issue.dueDate !== task.dueDate;
}

export function planSync(
  issues: readonly GitHubIssue[],
  tasks: readonly TodoistTask[],
  lastSyncedAt: string | null = null,
): SyncPlan {
  const taskByUrl = new Map<string, TodoistTask>();
  for (const task of tasks) {
    const url = extractIssueUrlFromDescription(task.description);
    if (url !== null) {
      taskByUrl.set(url, task);
    }
  }

  const toCreate: GitHubIssue[] = [];
  const toUpdate: SyncEntry[] = [];
  const toDelete: TodoistTask[] = [];
  const toComplete: TodoistTask[] = [];
  let toSkip = 0;

  const handledTaskIds = new Set<string>();

  for (const issue of issues) {
    const issueUrl = `https://github.com/${issue.repository}/issues/${issue.number}`;
    const task = taskByUrl.get(issueUrl);

    if (task !== undefined) {
      handledTaskIds.add(task.id);
    }

    if (lastSyncedAt !== null && issue.updatedAt <= lastSyncedAt) {
      toSkip++;
      continue;
    }

    if (issue.state === "CLOSED") {
      if (task !== undefined) {
        toComplete.push(task);
      }
      continue;
    }

    if (issue.projectItemId === null) {
      if (task !== undefined) {
        toDelete.push(task);
      }
      continue;
    }

    if (task === undefined) {
      toCreate.push(issue);
      continue;
    }

    if (hasContentDiff(issue, task)) {
      toUpdate.push({ issue, task });
    } else {
      toSkip++;
    }
  }

  for (const task of tasks) {
    if (!handledTaskIds.has(task.id)) {
      toDelete.push(task);
    }
  }

  return { toCreate, toUpdate, toDelete, toComplete, toSkip };
}
