import type { Task, TodoistApi } from "@doist/todoist-api-typescript";
import type { TodoistTask } from "./types";

type CreateTaskParams = {
  readonly content: string;
  readonly description: string;
  readonly dueDate?: string;
  readonly labels?: readonly string[];
};

type UpdateTaskParams = {
  readonly content?: string;
  readonly dueDate?: string | null;
};

export function mapTodoistTask(task: Task): TodoistTask {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    isCompleted: task.checked,
    updatedAt: task.updatedAt ?? task.addedAt ?? "",
    dueDate: task.due?.date ?? null,
    labels: task.labels,
  };
}

type FetchAllTasksParams = {
  readonly api: TodoistApi;
  readonly projectId: string;
  readonly cursor: string | null;
  readonly accumulated: readonly TodoistTask[];
};

async function fetchAllTasks(params: FetchAllTasksParams): Promise<readonly TodoistTask[]> {
  const { api, projectId, cursor, accumulated } = params;
  const response = await api.getTasks({ projectId, cursor });
  const all = [...accumulated, ...response.results.map(mapTodoistTask)];
  if (response.nextCursor === null) {
    return all;
  }
  return fetchAllTasks({ api, projectId, cursor: response.nextCursor, accumulated: all });
}

async function fetchAllLabelNames(
  api: TodoistApi,
  cursor: string | null,
  accumulated: readonly string[],
): Promise<readonly string[]> {
  const response = await api.getLabels({ cursor });
  const all = [
    ...accumulated,
    ...response.results.map(function (l) {
      return l.name;
    }),
  ];
  if (response.nextCursor === null) {
    return all;
  }
  return fetchAllLabelNames(api, response.nextCursor, all);
}

export async function getProjectTasks(
  api: TodoistApi,
  projectId: string,
): Promise<readonly TodoistTask[]> {
  return fetchAllTasks({ api, projectId, cursor: null, accumulated: [] });
}

export async function getTask(api: TodoistApi, taskId: string): Promise<TodoistTask | null> {
  try {
    const task = await api.getTask(taskId);
    return mapTodoistTask(task);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "httpStatusCode" in error &&
      error.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}

export async function createTask(
  api: TodoistApi,
  projectId: string,
  params: CreateTaskParams,
): Promise<TodoistTask> {
  const base = { content: params.content, description: params.description, projectId };
  let task;
  if (params.dueDate !== undefined && params.labels !== undefined) {
    task = await api.addTask({ ...base, dueDate: params.dueDate, labels: [...params.labels] });
  } else if (params.dueDate !== undefined) {
    task = await api.addTask({ ...base, dueDate: params.dueDate });
  } else if (params.labels !== undefined) {
    task = await api.addTask({ ...base, labels: [...params.labels] });
  } else {
    task = await api.addTask(base);
  }
  return mapTodoistTask(task);
}

export async function updateTask(
  api: TodoistApi,
  taskId: string,
  params: UpdateTaskParams,
): Promise<void> {
  const { content, dueDate } = params;
  if (dueDate === null && content !== undefined) {
    await api.updateTask(taskId, { content, dueString: null });
  } else if (dueDate === null) {
    await api.updateTask(taskId, { dueString: null });
  } else if (dueDate !== undefined && content !== undefined) {
    await api.updateTask(taskId, { content, dueDate });
  } else if (dueDate !== undefined) {
    await api.updateTask(taskId, { dueDate });
  } else if (content !== undefined) {
    await api.updateTask(taskId, { content });
  }
}

export async function completeTask(api: TodoistApi, taskId: string): Promise<void> {
  await api.closeTask(taskId);
}

export async function deleteTask(api: TodoistApi, taskId: string): Promise<void> {
  await api.deleteTask(taskId);
}

export async function getOrCreateLabel(api: TodoistApi, name: string): Promise<string> {
  const names = await fetchAllLabelNames(api, null, []);
  if (names.includes(name)) {
    return name;
  }
  await api.addLabel({ name });
  return name;
}

export async function addLabelToTask(
  api: TodoistApi,
  taskId: string,
  labelName: string,
): Promise<void> {
  const task = await api.getTask(taskId);
  if (!task.labels.includes(labelName)) {
    await api.updateTask(taskId, { labels: [...task.labels, labelName] });
  }
}
