import type { Task } from "@doist/todoist-api-typescript";
import { TodoistApi } from "@doist/todoist-api-typescript";
import type { TodoistTask } from "./types.js";

export type CreateTaskParams = {
  readonly content: string;
  readonly description: string;
  readonly dueDate?: string;
  readonly labels?: readonly string[];
};

export type UpdateTaskParams = {
  readonly content?: string;
  readonly dueDate?: string | null;
};

export type TodoistClient = {
  readonly getProjectTasks: (projectId: string) => Promise<readonly TodoistTask[]>;
  readonly getTask: (taskId: string) => Promise<TodoistTask | null>;
  readonly createTask: (projectId: string, params: CreateTaskParams) => Promise<TodoistTask>;
  readonly updateTask: (taskId: string, params: UpdateTaskParams) => Promise<void>;
  readonly completeTask: (taskId: string) => Promise<void>;
  readonly deleteTask: (taskId: string) => Promise<void>;
  readonly getOrCreateLabel: (name: string) => Promise<string>;
  readonly addLabelToTask: (taskId: string, labelName: string) => Promise<void>;
};

export const mapTodoistTask = (task: Task): TodoistTask => {
  return {
    id: task.id,
    content: task.content,
    description: task.description,
    isCompleted: task.checked,
    updatedAt: task.updatedAt ?? task.addedAt ?? "",
    dueDate: task.due?.date ?? null,
    labels: task.labels,
  };
};

export const createTodoistClient = (token: string): TodoistClient => {
  const api = new TodoistApi(token);

  const fetchAllTasks = async (
    projectId: string,
    cursor: string | null,
    accumulated: readonly TodoistTask[],
  ): Promise<readonly TodoistTask[]> => {
    const response = await api.getTasks({ projectId, cursor });
    const all = [...accumulated, ...response.results.map(mapTodoistTask)];
    if (response.nextCursor === null) {
      return all;
    }
    return fetchAllTasks(projectId, response.nextCursor, all);
  };

  const fetchAllLabelNames = async (
    cursor: string | null,
    accumulated: readonly string[],
  ): Promise<readonly string[]> => {
    const response = await api.getLabels({ cursor });
    const all = [...accumulated, ...response.results.map((l) => l.name)];
    if (response.nextCursor === null) {
      return all;
    }
    return fetchAllLabelNames(response.nextCursor, all);
  };

  return {
    getProjectTasks: async (projectId) => {
      return fetchAllTasks(projectId, null, []);
    },

    getTask: async (taskId) => {
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
    },

    createTask: async (projectId, params) => {
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
    },

    updateTask: async (taskId, params) => {
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
    },

    completeTask: async (taskId) => {
      await api.closeTask(taskId);
    },

    deleteTask: async (taskId) => {
      await api.deleteTask(taskId);
    },

    getOrCreateLabel: async (name) => {
      const names = await fetchAllLabelNames(null, []);
      if (names.includes(name)) {
        return name;
      }
      await api.addLabel({ name });
      return name;
    },

    addLabelToTask: async (taskId, labelName) => {
      const task = await api.getTask(taskId);
      if (!task.labels.includes(labelName)) {
        await api.updateTask(taskId, { labels: [...task.labels, labelName] });
      }
    },
  };
};
