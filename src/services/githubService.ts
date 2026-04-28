/**
 * GitHub REST API Service
 * Replaces simulated repo data with real GitHub API calls.
 */

const GITHUB_API = "https://api.github.com";

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export interface GHRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  html_url: string;
  pushed_at: string;
  open_issues_count: number;
}

export interface GHTrendingRepo extends GHRepo {
  weeklyGrowth?: number;
}

/** Search trending repos created/pushed in last N days */
export async function searchTrendingRepos(
  query: string,
  days = 7,
  token?: string
): Promise<GHRepo[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
  const url = new URL(`${GITHUB_API}/search/repositories`);
  url.searchParams.set("q", `${query} pushed:>${since}`);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "20");

  const res = await fetch(url.toString(), { headers: getHeaders(token) });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.items as GHRepo[];
}

/** Get a specific repo's details */
export async function getRepo(owner: string, repo: string, token?: string): Promise<GHRepo> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json();
}

/** Trigger a GitHub Actions workflow dispatch */
export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflowId: string,
  ref = "main",
  inputs: Record<string, string> = {},
  token?: string
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
    {
      method: "POST",
      headers: { ...getHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref, inputs }),
    }
  );
  if (!res.ok) throw new Error(`GitHub workflow trigger failed: ${res.status} ${res.statusText}`);
}

/** List workflow runs for a repo */
export async function getWorkflowRuns(
  owner: string,
  repo: string,
  workflowId?: string,
  token?: string
) {
  const path = workflowId
    ? `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`
    : `${GITHUB_API}/repos/${owner}/${repo}/actions/runs`;
  const res = await fetch(`${path}?per_page=10`, { headers: getHeaders(token) });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  return json.workflow_runs;
}

/** Get the latest commit SHA for a branch */
export async function getLatestCommit(
  owner: string,
  repo: string,
  branch = "main",
  token?: string
): Promise<{ sha: string; message: string; author: string; date: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/commits/${branch}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const json = await res.json();
  return {
    sha: json.sha,
    message: json.commit.message,
    author: json.commit.author.name,
    date: json.commit.author.date,
  };
}

/** Run npm audit via GitHub security advisories API */
export async function getSecurityAdvisories(
  ecosystem = "npm",
  token?: string
): Promise<{ ghsa_id: string; summary: string; severity: string; published_at: string }[]> {
  const res = await fetch(
    `${GITHUB_API}/advisories?ecosystem=${ecosystem}&per_page=10&sort=published&direction=desc`,
    { headers: getHeaders(token) }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json();
}
