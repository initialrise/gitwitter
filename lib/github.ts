import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The only place that knows how we authenticate with GitHub.
 * Today: the `gh` CLI, which reads the token from the OS keyring.
 * Swap the body of `api()` for a fetch + OAuth token to go multi-user.
 */

export type GhActor = {
  login: string;
  display_login?: string;
  avatar_url: string;
};

export type GhEvent = {
  id: string;
  type: string;
  actor: GhActor;
  repo: { id: number; name: string; url: string };
  org?: { login: string; avatar_url: string };
  created_at: string;
  payload: {
    action?: string;
    ref?: string;
    head?: string;
    before?: string;
    number?: number;
    pull_request?: { number?: number; html_url?: string; title?: string };
    issue?: { number?: number; title?: string; html_url?: string };
    comment?: { body?: string; html_url?: string };
    review?: { state?: string; body?: string; html_url?: string };
  };
};

const cache = new Map<string, Promise<unknown>>();

/** GET a REST path. Errors are the caller's problem — see `apiOrNull`. */
export async function api<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit) return hit as Promise<T>;

  const p = run("gh", ["api", "-H", "Accept: application/vnd.github+json", path], {
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  }).then(({ stdout }) => JSON.parse(stdout) as T);

  cache.set(path, p);
  p.catch(() => cache.delete(path)); // don't cache failures
  return p;
}

/** Repos go private, get renamed, get deleted. One 404 must not kill the feed. */
export async function apiOrNull<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path);
  } catch {
    return null;
  }
}

export async function viewer(): Promise<string> {
  const me = await api<{ login: string }>("/user");
  return me.login;
}

/**
 * GitHub caps this feed at 300 events / 3 pages. That is the entire
 * history available — roughly 1-2 days. No pagination beyond this exists.
 */
export async function receivedEvents(user: string): Promise<GhEvent[]> {
  const pages = await Promise.all(
    [1, 2, 3].map((page) =>
      apiOrNull<GhEvent[]>(
        `/users/${user}/received_events?per_page=100&page=${page}`,
      ),
    ),
  );
  return pages
    .flatMap((p) => p ?? [])
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
