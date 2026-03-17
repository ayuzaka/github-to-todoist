import type {
  GitHubIssue,
  Mapping,
  MappingCache,
  SyncDirection,
  SyncEntry,
  SyncPlan,
  TodoistTask,
} from "./types";

export function extractIssueUrlFromDescription(description: string): string | null {
  const match = /<!-- github-to-todoist: (https?:\/\/[^\s]+) -->/.exec(description);
  return match?.[1] ?? null;
}

export function buildIssueUrlComment(issueUrl: string): string {
  return `<!-- github-to-todoist: ${issueUrl} -->`;
}

export function determineSyncDirection(
  mapping: Mapping,
  issue: GitHubIssue,
  task: TodoistTask,
): SyncDirection {
  const { last_synced_at } = mapping;

  let issueUpdatedAfterSync: boolean;
  let taskUpdatedAfterSync: boolean;

  if (last_synced_at === null) {
    issueUpdatedAfterSync = true;
    taskUpdatedAfterSync = true;
  } else {
    issueUpdatedAfterSync = issue.updatedAt > last_synced_at;
    taskUpdatedAfterSync = task.updatedAt > last_synced_at;
  }

  if (issueUpdatedAfterSync && taskUpdatedAfterSync) {
    if (issue.updatedAt > task.updatedAt) {
      return "github-to-todoist";
    }
    if (task.updatedAt > issue.updatedAt) {
      return "todoist-to-github";
    }
    return "github-to-todoist";
  }

  if (issueUpdatedAfterSync) {
    return "github-to-todoist";
  }

  if (taskUpdatedAfterSync) {
    return "todoist-to-github";
  }

  return "skip";
}

function findTaskByIssueUrl(
  tasks: readonly TodoistTask[],
  issueUrl: string,
): TodoistTask | undefined {
  return tasks.find((t) => extractIssueUrlFromDescription(t.description) === issueUrl);
}

export function planSync(
  issues: readonly GitHubIssue[],
  tasks: readonly TodoistTask[],
  cache: MappingCache,
): SyncPlan {
  const taskById = new Map<string, TodoistTask>(tasks.map((t) => [t.id, t]));
  const mappingByIssueId = new Map<string, Mapping>(
    cache.mappings.map((m) => [m.github_issue_id, m]),
  );

  const toCreate: GitHubIssue[] = [];
  const toUpdate: SyncEntry[] = [];
  const toDelete: Mapping[] = [];
  const toComplete: Mapping[] = [];
  let toSkip = 0;

  const handledMappingIssueIds = new Set<string>();

  for (const issue of issues) {
    if (issue.state === "CLOSED") {
      const mapping = mappingByIssueId.get(issue.id);
      if (mapping !== undefined) {
        handledMappingIssueIds.add(issue.id);
        const task = taskById.get(mapping.todoist_task_id);
        if (task !== undefined) {
          toComplete.push(mapping);
        } else {
          toDelete.push(mapping);
        }
      }
      continue;
    }

    if (issue.projectItemId === null) {
      const mapping = mappingByIssueId.get(issue.id);
      if (mapping !== undefined) {
        handledMappingIssueIds.add(issue.id);
        toDelete.push(mapping);
      }
      continue;
    }

    const mapping = mappingByIssueId.get(issue.id);
    if (mapping === undefined) {
      const issueUrl = `https://github.com/${issue.repository}/issues/${issue.number}`;
      const matchingTask = findTaskByIssueUrl(tasks, issueUrl);
      if (matchingTask !== undefined) {
        const tempMapping: Mapping = {
          github_issue_id: issue.id,
          github_issue_number: issue.number,
          github_repo: issue.repository,
          todoist_task_id: matchingTask.id,
          last_synced_at: null,
        };
        const direction = determineSyncDirection(tempMapping, issue, matchingTask);
        if (direction === "skip") {
          toSkip++;
        } else {
          toUpdate.push({ mapping: tempMapping, issue, task: matchingTask, direction });
        }
      } else {
        toCreate.push(issue);
      }
      continue;
    }

    handledMappingIssueIds.add(issue.id);
    const task = taskById.get(mapping.todoist_task_id);
    if (task === undefined) {
      toDelete.push(mapping);
      continue;
    }

    const direction = determineSyncDirection(mapping, issue, task);
    if (direction === "skip") {
      toSkip++;
    } else {
      toUpdate.push({ mapping, issue, task, direction });
    }
  }

  for (const mapping of cache.mappings) {
    if (handledMappingIssueIds.has(mapping.github_issue_id)) {
      continue;
    }
    const task = taskById.get(mapping.todoist_task_id);
    if (task === undefined) {
      toDelete.push(mapping);
    }
  }

  return { toCreate, toUpdate, toDelete, toComplete, toSkip };
}
