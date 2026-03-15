import { describe, expect, test } from "vitest";
import { extractDueDate, mapProjectItem } from "./github.js";
import type { GitHubIssue } from "./types.js";
import type { ProjectItemNode } from "./github.js";

const baseIssueContent = {
  __typename: "Issue" as const,
  id: "I_xxx",
  number: 1,
  title: "Test Issue",
  state: "OPEN",
  updatedAt: "2026-03-13T00:00:00Z",
  createdAt: "2026-03-01T00:00:00Z",
  repository: { nameWithOwner: "owner/repo" },
};

describe(extractDueDate, () => {
  test("Date フィールドの値を返す", () => {
    // Arrange
    const nodes = [
      {
        __typename: "ProjectV2ItemFieldDateValue",
        field: { name: "Date" },
        date: "2026-04-01",
      },
    ];

    // Act
    const result = extractDueDate(nodes);

    // Assert
    expect(result).toBe("2026-04-01");
  });

  test("Date フィールドがない場合は null を返す", () => {
    // Arrange
    const nodes = [{ __typename: "ProjectV2ItemFieldTextValue", field: { name: "Title" } }];

    // Act
    const result = extractDueDate(nodes);

    // Assert
    expect(result).toBeNull();
  });

  test("空配列の場合は null を返す", () => {
    // Arrange
    const nodes: typeof extractDueDate extends (nodes: infer N) => unknown ? N : never = [];

    // Act
    const result = extractDueDate(nodes);

    // Assert
    expect(result).toBeNull();
  });
});

describe(mapProjectItem, () => {
  test("Issue コンテンツを GitHubIssue にマップする", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PVTI_xxx",
      content: baseIssueContent,
      fieldValues: {
        nodes: [
          {
            __typename: "ProjectV2ItemFieldDateValue",
            field: { name: "Date" },
            date: "2026-04-01",
          },
        ],
      },
    };
    const expected: GitHubIssue = {
      id: "I_xxx",
      number: 1,
      title: "Test Issue",
      state: "OPEN",
      updatedAt: "2026-03-13T00:00:00Z",
      createdAt: "2026-03-01T00:00:00Z",
      repository: "owner/repo",
      projectItemId: "PVTI_xxx",
      dueDate: "2026-04-01",
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toStrictEqual(expected);
  });

  test("Issue でないコンテンツは null を返す", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PVTI_draft",
      content: { __typename: "DraftIssue" },
      fieldValues: { nodes: [] },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toBeNull();
  });

  test("content が null の場合は null を返す", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PVTI_null",
      content: null,
      fieldValues: { nodes: [] },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result).toBeNull();
  });

  test("CLOSED 状態の Issue を正しくマップする", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PVTI_closed",
      content: { ...baseIssueContent, state: "CLOSED" },
      fieldValues: { nodes: [] },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result?.state).toBe("CLOSED");
  });

  test("Date フィールドなしの場合 dueDate は null", () => {
    // Arrange
    const node: ProjectItemNode = {
      id: "PVTI_nodate",
      content: baseIssueContent,
      fieldValues: { nodes: [] },
    };

    // Act
    const result = mapProjectItem(node);

    // Assert
    expect(result?.dueDate).toBeNull();
  });
});
