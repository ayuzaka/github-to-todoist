import type { GitHubIssue } from "./types";
import { graphql } from "@octokit/graphql";

export type UpdateProjectItemDateParams = {
  readonly projectId: string;
  readonly itemId: string;
  readonly fieldId: string;
  readonly date: string | null;
};

export type GitHubClient = {
  readonly getProjectItems: (
    owner: string,
    projectNumber: number,
  ) => Promise<readonly GitHubIssue[]>;
  readonly getIssue: (
    owner: string,
    repo: string,
    issueNumber: number,
  ) => Promise<GitHubIssue | null>;
  readonly updateIssueTitle: (issueId: string, title: string) => Promise<void>;
  readonly closeIssue: (issueId: string) => Promise<void>;
  readonly reopenIssue: (issueId: string) => Promise<void>;
  readonly updateProjectItemDate: (params: UpdateProjectItemDateParams) => Promise<void>;
};

type FieldValueNode = {
  readonly __typename?: string;
  readonly field?: { readonly name?: string };
  readonly date?: string;
};

type IssueContent = {
  readonly __typename: "Issue";
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly createdAt: string;
  readonly repository: { readonly nameWithOwner: string };
};

export type ProjectItemNode = {
  readonly id: string;
  readonly content: IssueContent | { readonly __typename: string } | null;
  readonly fieldValues: {
    readonly nodes: readonly FieldValueNode[];
  };
};

type ProjectItemsResponse = {
  readonly repositoryOwner: {
    readonly projectV2: {
      readonly id: string;
      readonly items: {
        readonly pageInfo: {
          readonly hasNextPage: boolean;
          readonly endCursor: string | null;
        };
        readonly nodes: readonly ProjectItemNode[];
      };
    };
  };
};

type GetIssueResponse = {
  readonly repository: {
    readonly issue: IssueContent | null;
  };
};

const GET_PROJECT_ITEMS = `
  query GetProjectItems($owner: String!, $projectNumber: Int!, $cursor: String) {
    repositoryOwner(login: $owner) {
      projectV2(number: $projectNumber) {
        id
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content {
              ... on Issue {
                id number title state updatedAt createdAt
                repository { nameWithOwner }
              }
            }
            fieldValues(first: 100) {
              nodes {
                ... on ProjectV2ItemFieldDateValue {
                  field { ... on ProjectV2Field { name } }
                  date
                }
              }
            }
          }
        }
      }
    }
  }
`;

const GET_ISSUE = `
  query GetIssue($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id number title state updatedAt createdAt
        repository { nameWithOwner }
      }
    }
  }
`;

const UPDATE_ISSUE_TITLE = `
  mutation UpdateIssueTitle($issueId: ID!, $title: String!) {
    updateIssue(input: { id: $issueId, title: $title }) {
      issue { id }
    }
  }
`;

const CLOSE_ISSUE = `
  mutation CloseIssue($issueId: ID!) {
    closeIssue(input: { issueId: $issueId }) {
      issue { id }
    }
  }
`;

const REOPEN_ISSUE = `
  mutation ReopenIssue($issueId: ID!) {
    reopenIssue(input: { issueId: $issueId }) {
      issue { id }
    }
  }
`;

const UPDATE_PROJECT_DATE = `
  mutation UpdateProjectDate($projectId: ID!, $itemId: ID!, $fieldId: ID!, $date: Date!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
      value: { date: $date }
    }) {
      projectV2Item { id }
    }
  }
`;

const CLEAR_PROJECT_DATE = `
  mutation ClearProjectDate($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
    clearProjectV2ItemFieldValue(input: {
      projectId: $projectId
      itemId: $itemId
      fieldId: $fieldId
    }) {
      projectV2Item { id }
    }
  }
`;

function isIssueContent(content: ProjectItemNode["content"]): content is IssueContent {
  return content?.__typename === "Issue";
}

export function extractDueDate(nodes: readonly FieldValueNode[]): string | null {
  for (const node of nodes) {
    if (
      node.__typename === "ProjectV2ItemFieldDateValue" &&
      node.field?.name === "Date" &&
      node.date !== undefined
    ) {
      return node.date;
    }
  }
  return null;
}

export function mapProjectItem(node: ProjectItemNode): GitHubIssue | null {
  if (!isIssueContent(node.content)) {
    return null;
  }
  const { content } = node;
  return {
    id: content.id,
    number: content.number,
    title: content.title,
    state: content.state === "OPEN" ? "OPEN" : "CLOSED",
    updatedAt: content.updatedAt,
    createdAt: content.createdAt,
    repository: content.repository.nameWithOwner,
    projectItemId: node.id,
    dueDate: extractDueDate(node.fieldValues.nodes),
  };
}

type FetchParams = {
  readonly owner: string;
  readonly projectNumber: number;
  readonly cursor: string | null;
  readonly accumulated: readonly GitHubIssue[];
};

export function createGitHubClient(token: string): GitHubClient {
  const exec = graphql.defaults({
    headers: { authorization: `token ${token}` },
  });

  async function fetchAllPages(params: FetchParams): Promise<readonly GitHubIssue[]> {
    const { owner, projectNumber, cursor, accumulated } = params;
    const { repositoryOwner } = await exec<ProjectItemsResponse>(GET_PROJECT_ITEMS, {
      owner,
      projectNumber,
      cursor,
    });
    const { items } = repositoryOwner.projectV2;
    const current = items.nodes
      .map(mapProjectItem)
      .filter((item): item is GitHubIssue => item !== null);
    const all = [...accumulated, ...current];
    if (!items.pageInfo.hasNextPage) {
      return all;
    }
    return fetchAllPages({
      owner,
      projectNumber,
      cursor: items.pageInfo.endCursor,
      accumulated: all,
    });
  }

  return {
    getProjectItems: async function (owner, projectNumber) {
      return fetchAllPages({ owner, projectNumber, cursor: null, accumulated: [] });
    },

    getIssue: async function (owner, repo, issueNumber) {
      const { repository } = await exec<GetIssueResponse>(GET_ISSUE, {
        owner,
        repo,
        number: issueNumber,
      });
      const { issue } = repository;
      if (issue === null) {
        return null;
      }
      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state === "OPEN" ? "OPEN" : "CLOSED",
        updatedAt: issue.updatedAt,
        createdAt: issue.createdAt,
        repository: issue.repository.nameWithOwner,
        projectItemId: null,
        dueDate: null,
      };
    },

    updateIssueTitle: async function (issueId, title) {
      await exec(UPDATE_ISSUE_TITLE, { issueId, title });
    },

    closeIssue: async function (issueId) {
      await exec(CLOSE_ISSUE, { issueId });
    },

    reopenIssue: async function (issueId) {
      await exec(REOPEN_ISSUE, { issueId });
    },

    updateProjectItemDate: async function ({ projectId, itemId, fieldId, date }) {
      if (date === null) {
        await exec(CLEAR_PROJECT_DATE, { projectId, itemId, fieldId });
      } else {
        await exec(UPDATE_PROJECT_DATE, { projectId, itemId, fieldId, date });
      }
    },
  };
}
