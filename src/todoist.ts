import type { Task, TodoistApi } from "@doist/todoist-api-typescript";
import type { TodoistTask } from "./types";

type CreateTaskParams = {
  readonly content: string;
  readonly description: string;
  readonly dueDate: string | null;
  readonly labels: readonly string[];
};

type UpdateTaskParams = {
  readonly content: string;
  readonly dueDate: string | null;
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
  const allTasks = [...accumulated, ...response.results.map(mapTodoistTask)];

  if (response.nextCursor === null) {
    return allTasks;
  }

  return fetchAllTasks({ api, projectId, cursor: response.nextCursor, accumulated: allTasks });
}

async function fetchAllLabelNames(
  api: TodoistApi,
  cursor: string | null,
  accumulated: readonly string[],
): Promise<readonly string[]> {
  const response = await api.getLabels({ cursor });
  const allLabelsName = [...accumulated, ...response.results.map((label) => label.name)];

  if (response.nextCursor === null) {
    return allLabelsName;
  }

  return fetchAllLabelNames(api, response.nextCursor, allLabelsName);
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
  const { content, description, dueDate, labels } = params;
  const base = { content, description, projectId, labels: [...labels] };

  if (dueDate !== null) {
    return mapTodoistTask(await api.addTask({ ...base, dueDate }));
  }

  return mapTodoistTask(await api.addTask(base));
}

export async function updateTask(
  api: TodoistApi,
  taskId: string,
  params: UpdateTaskParams,
): Promise<void> {
  const { content, dueDate } = params;
  if (dueDate === null) {
    await api.updateTask(taskId, { content, dueString: null });
    return;
  }

  await api.updateTask(taskId, { content, dueDate });
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
