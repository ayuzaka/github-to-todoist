import { describe, expect, test, vi } from "vitest";
import { getProjectItems, mapProjectItem } from "./github.ts";
import { IssueState } from "./github.generated.ts";

const baseIssueContent = {
  __typename: "Issue" as const,
  id: "I_xxx",
  number: 1,
  title: "Test Issue",
  labels: {
    nodes: [{ name: "backend" }, { name: "urgent" }],
  },
  state: IssueState.Open,
  updatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: { nameWithOwner: "owner/repo" },
};

type ProjectItemNode = Parameters<typeof mapProjectItem>[0];

describe(mapProjectItem, () => {
  test("Issue コンテンツを GitHubIssue にマップする", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PROJECT_ID_1",
      content: baseIssueContent,
      dateField: {
        __typename: "ProjectV2ItemFieldDateValue",
        date: "2026-04-01",
      },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toStrictEqual({
      id: "I_xxx",
      number: 1,
      title: "Test Issue",
      labels: ["backend", "urgent"],
      state: "OPEN",
      updatedAt: "2026-03-13T00:00:00Z",
      createdAt: "2026-03-01T00:00:00Z",
      repository: "owner/repo",
      projectItemId: "PROJECT_ID_1",
      dueDate: "2026-04-01",
    });
  });

  test("Issue でないコンテンツは null を返す", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PJT_draft",
      content: { __typename: "DraftIssue" },
      dateField: null,
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toBeNull();
  });

  test("content が null の場合は null を返す", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PJT_null",
      content: null,
      dateField: null,
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toBeNull();
  });

  test("CLOSED 状態の Issue を正しくマップする", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PJT_closed",
      content: { ...baseIssueContent, state: IssueState.Closed },
      dateField: null,
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result?.state).toBe("CLOSED");
  });

  test("Date フィールドなしの場合 dueDate は null", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PJT_nodate",
      content: baseIssueContent,
      dateField: null,
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result?.dueDate).toBeNull();
  });

  test("Date 以外のフィールド値型の場合 dueDate は null", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PJT_text",
      content: baseIssueContent,
      dateField: { __typename: "ProjectV2ItemFieldTextValue" },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result?.dueDate).toBeNull();
  });
});

describe(getProjectItems, () => {
  test("User または Organization に対して projectV2 を問い合わせる", async () => {
    // Arrange
    const execMock = vi.fn().mockResolvedValue({
      repositoryOwner: {
        __typename: "User",
        projectV2: {
          id: "PVT_test",
          items: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            nodes: [],
          },
        },
      },
    });
    const exec = execMock as Parameters<typeof getProjectItems>[0];

    // Act
    await getProjectItems(exec, "owner", 2);

    // Assert
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("... on User"),
      expect.objectContaining({
        owner: "owner",
        projectNumber: 2,
        cursor: null,
      }),
    );
    expect(execMock).toHaveBeenCalledWith(
      expect.stringContaining("... on Organization"),
      expect.anything(),
    );
  });

  test("Issue 判定のため content.__typename を問い合わせる", async () => {
    // Arrange
    const execMock = vi.fn().mockResolvedValue({
      repositoryOwner: {
        __typename: "User",
        projectV2: {
          id: "PVT_test",
          items: {
            pageInfo: {
              hasNextPage: false,
              endCursor: null,
            },
            nodes: [],
          },
        },
      },
    });
    const exec = execMock as Parameters<typeof getProjectItems>[0];

    // Act
    await getProjectItems(exec, "owner", 2);

    // Assert
    const query = execMock.mock.calls[0]?.[0];
    expect(query).toContain("content {");
    expect(query).toContain("__typename");
    expect(query).toContain("labels(first: 100)");
  });
});
