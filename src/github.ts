import type { GetProjectItemsQuery, GetProjectItemsQueryVariables } from "./github.generated.ts";
import type { GitHubIssue } from "./types.ts";
import { graphql } from "@octokit/graphql";
import { readFileSync } from "node:fs";

type GitHubExec = <Response>(
  query: string,
  parameters: GetProjectItemsQueryVariables,
) => Promise<Response>;

type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

type ProjectItems = NonNullable<
  NonNullable<
    NonNullable<NonNullable<GetProjectItemsQuery["repositoryOwner"]>["projectV2"]>["items"]
  >
>;

type ProjectItemNode = NonNullable<ArrayElement<NonNullable<ProjectItems["nodes"]>>>;

type IssueContent = Extract<NonNullable<ProjectItemNode["content"]>, { __typename?: "Issue" }>;
type IssueLabelNode = NonNullable<
  ArrayElement<NonNullable<NonNullable<IssueContent["labels"]>["nodes"]>>
>;

const GET_PROJECT_ITEMS = readFileSync(new URL("github.graphql", import.meta.url), "utf8");

function isIssueContent(content: ProjectItemNode["content"]): content is IssueContent {
  return content?.__typename === "Issue";
}

export function mapProjectItem(node: ProjectItemNode): GitHubIssue | null {
  const { content } = node;

  if (!isIssueContent(content)) {
    return null;
  }

  const labelNodes = content.labels?.nodes ?? [];

  return {
    id: content.id,
    number: content.number,
    title: content.title,
    labels: labelNodes
      .filter((label): label is IssueLabelNode => label !== null)
      .map((label) => label.name),
    state: content.state === "OPEN" ? "OPEN" : "CLOSED",
    updatedAt: content.updatedAt,
    createdAt: content.createdAt,
    repository: content.repository.nameWithOwner,
    projectItemId: node.id,
    dueDate:
      node.dateField?.__typename === "ProjectV2ItemFieldDateValue"
        ? (node.dateField.date ?? null)
        : null,
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
  const variables: GetProjectItemsQueryVariables = {
    owner,
    projectNumber,
    cursor,
  };
  const { repositoryOwner } = await exec<GetProjectItemsQuery>(GET_PROJECT_ITEMS, variables);

  if (repositoryOwner?.projectV2 === undefined || repositoryOwner.projectV2 === null) {
    throw new Error(`GitHub owner '${owner}' does not support projectV2`);
  }

  const project = repositoryOwner.projectV2;
  const { items } = project;
  const current = (items.nodes ?? [])
    .filter((node): node is ProjectItemNode => node !== null)
    .map((node) => mapProjectItem(node))
    .filter((item) => item !== null);
  const all = [...accumulated, ...current];
  if (!items.pageInfo.hasNextPage) {
    return all;
  }

  return fetchAllPages({
    exec,
    owner,
    projectNumber,
    cursor: items.pageInfo.endCursor ?? null,
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
