import type { Mapping, MappingCache, SyncPlan, SyncResult } from "./types";
import type { GitHubClient } from "./github";
import type { TodoistClient } from "./todoist";
import { buildIssueUrlComment } from "./sync-planner";

export type SyncConfig = {
  readonly githubProjectOwner: string;
  readonly githubProjectNumber: number;
  readonly githubProjectId?: string;
  readonly githubDateFieldId?: string;
  readonly todoistProjectId: string;
};

type ExecuteSyncPlanParams = {
  readonly github: GitHubClient;
  readonly todoist: TodoistClient;
  readonly cache: MappingCache;
  readonly config: SyncConfig;
};

type MutableResult = {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  errors: string[];
};

export const executeSyncPlan = async (
  plan: SyncPlan,
  params: ExecuteSyncPlanParams,
): Promise<{ result: SyncResult; updatedCache: MappingCache }> => {
  const { github, todoist, cache, config } = params;
  const r: MutableResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: plan.toSkip,
    errors: [],
  };

  let mappings = [...cache.mappings];

  const createResults = await Promise.allSettled(
    plan.toCreate.map(async (issue) => {
      const issueUrl = `https://github.com/${issue.repository}/issues/${issue.number}`;
      const description = buildIssueUrlComment(issueUrl);
      const labelName = await todoist.getOrCreateLabel(issue.repository);
      let task;
      if (issue.dueDate !== null) {
        task = await todoist.createTask(config.todoistProjectId, {
          content: issue.title,
          description,
          dueDate: issue.dueDate,
          labels: [labelName],
        });
      } else {
        task = await todoist.createTask(config.todoistProjectId, {
          content: issue.title,
          description,
          labels: [labelName],
        });
      }
      await todoist.addLabelToTask(task.id, labelName);
      const newMapping: Mapping = {
        github_issue_id: issue.id,
        github_issue_number: issue.number,
        github_repo: issue.repository,
        todoist_task_id: task.id,
        last_synced_at: issue.createdAt,
      };
      return newMapping;
    }),
  );

  for (const res of createResults) {
    if (res.status === "fulfilled") {
      r.created++;
      mappings.push(res.value);
    } else {
      r.errors.push(String(res.reason));
    }
  }

  const deleteResults = await Promise.allSettled(
    plan.toDelete.map(async (mapping) => {
      await todoist.deleteTask(mapping.todoist_task_id);
      return mapping.github_issue_id;
    }),
  );

  for (const res of deleteResults) {
    if (res.status === "fulfilled") {
      r.deleted++;
      mappings = mappings.filter((m) => m.github_issue_id !== res.value);
    } else {
      r.errors.push(String(res.reason));
    }
  }

  const completeResults = await Promise.allSettled(
    plan.toComplete.map(async (mapping) => {
      await todoist.completeTask(mapping.todoist_task_id);
      return mapping.github_issue_id;
    }),
  );

  for (const res of completeResults) {
    if (res.status === "fulfilled") {
      r.deleted++;
      mappings = mappings.filter((m) => m.github_issue_id !== res.value);
    } else {
      r.errors.push(String(res.reason));
    }
  }

  const updateResults = await Promise.allSettled(
    plan.toUpdate.map(async (entry) => {
      const { mapping, issue, task, direction } = entry;
      if (direction === "github-to-todoist") {
        await todoist.updateTask(task.id, {
          content: issue.title,
          dueDate: issue.dueDate,
        });
      } else {
        await github.updateIssueTitle(issue.id, task.content);
        if (task.isCompleted) {
          await github.closeIssue(issue.id);
        }
        const { githubProjectId, githubDateFieldId } = config;
        if (
          issue.projectItemId !== null &&
          githubProjectId !== undefined &&
          githubDateFieldId !== undefined
        ) {
          await github.updateProjectItemDate({
            projectId: githubProjectId,
            itemId: issue.projectItemId,
            fieldId: githubDateFieldId,
            date: task.dueDate,
          });
        }
      }
      return mapping;
    }),
  );

  for (const res of updateResults) {
    if (res.status === "fulfilled") {
      r.updated++;
      const synced = { ...res.value, last_synced_at: new Date().toISOString() };
      const existsInCache = mappings.some((m) => m.github_issue_id === synced.github_issue_id);
      if (existsInCache) {
        mappings = mappings.map((m) => (m.github_issue_id === synced.github_issue_id ? synced : m));
      } else {
        mappings.push(synced);
      }
    } else {
      r.errors.push(String(res.reason));
    }
  }

  return {
    result: {
      created: r.created,
      updated: r.updated,
      deleted: r.deleted,
      skipped: r.skipped,
      errors: r.errors,
    },
    updatedCache: { mappings },
  };
};
