import type { GitHubIssue } from "./types";
import { graphql } from "@octokit/graphql";

type GitHubExec = typeof graphql;

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
  const { content } = node;

  if (!isIssueContent(content)) {
    return null;
  }

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
  readonly exec: GitHubExec;
  readonly owner: string;
  readonly projectNumber: number;
  readonly cursor: string | null;
  readonly accumulated: readonly GitHubIssue[];
};

async function fetchAllPages(params: FetchParams): Promise<readonly GitHubIssue[]> {
  const { exec, owner, projectNumber, cursor, accumulated } = params;
  const { repositoryOwner } = await exec<ProjectItemsResponse>(GET_PROJECT_ITEMS, {
    owner,
    projectNumber,
    cursor,
  });
  const { items } = repositoryOwner.projectV2;
  const current = items.nodes.map(mapProjectItem).filter((item) => item !== null);
  const all = [...accumulated, ...current];
  if (!items.pageInfo.hasNextPage) {
    return all;
  }

  return fetchAllPages({
    exec,
    owner,
    projectNumber,
    cursor: items.pageInfo.endCursor,
    accumulated: all,
  });
}

export function createGitHubExec(token: string): GitHubExec {
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}

export async function getProjectItems(
  exec: GitHubExec,
  owner: string,
  projectNumber: number,
): Promise<readonly GitHubIssue[]> {
  return fetchAllPages({ exec, owner, projectNumber, cursor: null, accumulated: [] });
}
