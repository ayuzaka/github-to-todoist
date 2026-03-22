import type { SyncPlan, SyncResult } from "./types.ts";
import { buildIssueUrlComment, formatTaskContent } from "./sync-planner.ts";
import { completeTask, createTask, deleteTask, getOrCreateSection, updateTask } from "./todoist.ts";
import type { TodoistApi } from "@doist/todoist-api-typescript";

export type SyncConfig = {
  readonly githubProjectOwner: string;
  readonly githubProjectNumber: number;
  readonly todoistProjectId: string;
};

type ExecuteSyncPlanParams = {
  readonly todoist: TodoistApi;
  readonly config: SyncConfig;
};

type MutableResult = {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

export async function executeSyncPlan(
  plan: SyncPlan,
  params: ExecuteSyncPlanParams,
): Promise<SyncResult> {
  const { todoist, config } = params;
  const r: MutableResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: plan.toSkip,
    errors: [],
  };

  const [createResults, deleteResults, completeResults, updateResults] = await Promise.all([
    Promise.allSettled(
      plan.toCreate.map(async (issue) => {
        const issueUrl = `https://github.com/${issue.repository}/issues/${issue.number}`;
        const description = buildIssueUrlComment(issueUrl);
        const sectionId = await getOrCreateSection(
          todoist,
          config.todoistProjectId,
          issue.repository,
        );
        await createTask(todoist, config.todoistProjectId, {
          content: formatTaskContent(issue),
          description,
          dueDate: issue.dueDate,
          labels: [...issue.labels],
          sectionId,
        });
      }),
    ),
    Promise.allSettled(
      plan.toDelete.map(async (task) => {
        await deleteTask(todoist, task.id);
      }),
    ),
    Promise.allSettled(
      plan.toComplete.map(async (task) => {
        await completeTask(todoist, task.id);
      }),
    ),
    Promise.allSettled(
      plan.toUpdate.map(async (entry) => {
        const { issue, task } = entry;
        await updateTask(todoist, task.id, {
          content: formatTaskContent(issue),
          dueDate: issue.dueDate,
          labels: [...issue.labels],
        });
      }),
    ),
  ]);

  for (const res of createResults) {
    if (res.status === "fulfilled") {
      r.created++;
    } else {
      r.errors.push(String(res.reason));
    }
  }

  for (const res of deleteResults) {
    if (res.status === "fulfilled") {
      r.deleted++;
    } else {
      r.errors.push(String(res.reason));
    }
  }

  for (const res of completeResults) {
    if (res.status === "fulfilled") {
      r.deleted++;
    } else {
      r.errors.push(String(res.reason));
    }
  }

  for (const res of updateResults) {
    if (res.status === "fulfilled") {
      r.updated++;
    } else {
      r.errors.push(String(res.reason));
    }
  }

  return {
    created: r.created,
    updated: r.updated,
    deleted: r.deleted,
    skipped: r.skipped,
    errors: r.errors,
  };
}
