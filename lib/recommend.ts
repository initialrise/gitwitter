import { apiOrNull, type GhActor, type GhEvent } from "./github.ts";

/**
 * GitHub has no public recommendations API — github.com's "For you" is
 * internal, and the GraphQL schema exposes nothing beyond reviewer and list
 * suggestions. So this reproduces the signal rather than the endpoint:
 * repos that people you follow are converging on, which you have not starred.
 *
 * That is ordinary collaborative filtering, and the whole input set is already
 * fetched for the feed — the only extra reads are your own stars.
 */

export type Rec = Ranked & {
  about?: string;
  stars?: number;
  language?: string;
};

/** How strongly each act signals "this repo is worth your time". */
const WEIGHT: Record<string, number> = {
  ForkEvent: 3, // took a copy to work with
  PullRequestEvent: 3, // invested real effort
  PullRequestReviewEvent: 2,
  PullRequestReviewCommentEvent: 2,
  IssuesEvent: 2,
  IssueCommentEvent: 2,
  WatchEvent: 2, // starred
  CommitCommentEvent: 1,
  PushEvent: 1, // often just their day job
};

const VERB_OF: Record<string, string> = {
  WatchEvent: "starred",
  ForkEvent: "forked",
};

export type Ranked = {
  repo: string;
  actors: GhActor[];
  score: number;
  reason: string;
  newest: string;
};

/** Pure half: everything except the network. */
export function rank(
  events: GhEvent[],
  viewer: string,
  starred: Set<string>,
  limit = 15,
): Ranked[] {
  const me = viewer.toLowerCase();

  type Candidate = {
    repo: string;
    byActor: Map<string, { actor: GhActor; weight: number; verbs: Set<string> }>;
    newest: string;
  };
  const candidates = new Map<string, Candidate>();

  for (const e of events) {
    const weight = WEIGHT[e.type];
    if (!weight) continue;
    if (e.actor.login.endsWith("[bot]")) continue;

    const repo = e.repo.name;
    const owner = repo.split("/")[0].toLowerCase();
    if (owner === me) continue; // your own work is not a discovery
    if (starred.has(repo.toLowerCase())) continue; // already starred
    if (e.actor.login.toLowerCase() === owner) continue; // authors boost themselves

    let c = candidates.get(repo);
    if (!c) {
      c = { repo, byActor: new Map(), newest: e.created_at };
      candidates.set(repo, c);
    }
    if (e.created_at > c.newest) c.newest = e.created_at;

    // One person counts once, at the strongest thing they did.
    const prev = c.byActor.get(e.actor.login);
    const verb = VERB_OF[e.type] ?? "contributed to";
    if (prev) {
      prev.weight = Math.max(prev.weight, weight);
      prev.verbs.add(verb);
    } else {
      c.byActor.set(e.actor.login, {
        actor: e.actor,
        weight,
        verbs: new Set([verb]),
      });
    }
  }

  return [...candidates.values()]
    .map((c) => {
      const people = [...c.byActor.values()].sort((a, b) => b.weight - a.weight);
      // Agreement between people is the real signal, so reward breadth
      // super-linearly: three people converging beats one person forking.
      const score =
        people.reduce((n, p) => n + p.weight, 0) * Math.sqrt(people.length);
      return {
        repo: c.repo,
        actors: people.map((p) => p.actor),
        score,
        reason: reasonFor(people),
        newest: c.newest,
      };
    })
    .sort((a, b) => b.score - a.score || Date.parse(b.newest) - Date.parse(a.newest))
    .slice(0, limit);
}

export async function recommend(
  events: GhEvent[],
  viewer: string,
  limit = 15,
): Promise<Rec[]> {
  const starred = await starredByViewer();
  // Over-rank, because some candidates drop out as archived or unreachable.
  const ranked = rank(events, viewer, starred, limit * 2);

  const detailed = await Promise.all(
    ranked.map(async (r): Promise<Rec | null> => {
      const repo = await apiOrNull<{
        description: string | null;
        stargazers_count: number;
        language: string | null;
        archived: boolean;
      }>(`/repos/${r.repo}`);
      if (!repo || repo.archived) return null;

      return {
        ...r,
        about: repo.description ?? undefined,
        stars: repo.stargazers_count,
        language: repo.language ?? undefined,
      };
    }),
  );

  return detailed.filter((r): r is Rec => r !== null).slice(0, limit);
}

function reasonFor(
  people: { verbs: Set<string> }[],
): string {
  const counts = new Map<string, number>();
  for (const p of people)
    for (const v of p.verbs) counts.set(v, (counts.get(v) ?? 0) + 1);

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([verb, n]) => `${n} ${n === 1 ? "person" : "people"} ${verb}`);

  return `${parts.join(", ")} — from people you follow`;
}

/**
 * Your existing stars, so nothing already in your library is recommended.
 *
 * Each page is 100 full repo objects and takes ~2s, and there is no count to
 * read up front — so fetch a batch of pages at once and only go round again if
 * every page in the batch came back full. Sequentially this was the single
 * slowest thing on the page.
 */
const STAR_PAGES_AT_ONCE = 8;

async function starredByViewer(): Promise<Set<string>> {
  const starred = new Set<string>();

  for (let start = 1; start <= 40; start += STAR_PAGES_AT_ONCE) {
    const pages = await Promise.all(
      Array.from({ length: STAR_PAGES_AT_ONCE }, (_, i) =>
        apiOrNull<{ full_name: string }[]>(
          `/user/starred?per_page=100&page=${start + i}`,
        ),
      ),
    );
    for (const page of pages)
      for (const r of page ?? []) starred.add(r.full_name.toLowerCase());

    if (pages.some((p) => !p || p.length < 100)) break;
  }

  return starred;
}
