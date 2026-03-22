import type { GitHubIssue } from "./github.ts";
import type { TodoistTask } from "./todoist.ts";

type SyncEntry = {
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

export function extractIssueUrlFromDescription(description: string): string | null {
  const match = /<!-- github-to-todoist: (https?:\/\/[^\s]+) -->/.exec(description);
  return match?.[1] ?? null;
}

export function parseRepositoryFromIssueUrl(url: string): string | null {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/\d+$/.exec(url);

  return match?.[1] ?? null;
}

export function parseTaskContent(content: string): { number: number; title: string } | null {
  const match = /^\[#(\d+)\] (.+)$/.exec(content);
  if (match === null) {
    return null;
  }

  return { number: Number(match[1]), title: match[2] ?? "" };
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

function formatTaskLine(task: TodoistTask): string {
  const url = extractIssueUrlFromDescription(task.description);
  const repo = url !== null ? parseRepositoryFromIssueUrl(url) : null;
  const parsed = parseTaskContent(task.content);
  if (repo !== null && parsed !== null) {
    return `${repo} #${parsed.number} ${parsed.title}`;
  }
  return task.content;
}

export function formatDryRunPlan(plan: SyncPlan): string {
  const lines: string[] = [
    `[DRY RUN] Would sync: ${plan.toCreate.length} create, ${plan.toUpdate.length} update, ${plan.toDelete.length} delete, ${plan.toComplete.length} complete, ${plan.toSkip} skipped`,
  ];

  for (const issue of plan.toCreate) {
    lines.push(`  新規作成: ${issue.repository} #${issue.number} ${issue.title}`);
  }
  for (const entry of plan.toUpdate) {
    lines.push(`  更新: ${entry.issue.repository} #${entry.issue.number} ${entry.issue.title}`);
  }
  for (const task of plan.toDelete) {
    lines.push(`  削除: ${formatTaskLine(task)}`);
  }
  for (const task of plan.toComplete) {
    lines.push(`  完了: ${formatTaskLine(task)}`);
  }

  return lines.join("\n") + "\n";
}
