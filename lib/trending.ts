import { api } from "./github.ts";

/**
 * github.com/trending has no API — /trending and /repositories/trending both
 * 404, and the page itself is HTML. Its real metric is *star velocity*, which
 * the search API cannot express at all.
 *
 * So this is an approximation, and an honest one: repos created recently,
 * ranked by the stars they have accumulated since. Young and already popular
 * is most of what "trending" means in practice. Unlike the rest of the app
 * this is not personalised — it is the same list for everybody.
 */

export type TrendingRepo = {
  repo: string;
  owner: string;
  avatar: string;
  about?: string;
  stars: number;
  language?: string;
  created: string;
  url: string;
};

export const WINDOW_DAYS = 30;
const PER_PAGE = 30;
/** The search API stops serving results past 1000 matches. */
const MAX_PAGE = Math.floor(1000 / PER_PAGE);

type SearchResult = {
  total_count: number;
  items: {
    full_name: string;
    owner: { login: string; avatar_url: string };
    description: string | null;
    stargazers_count: number;
    language: string | null;
    created_at: string;
    html_url: string;
  }[];
};

export async function trending(
  page = 1,
  now = Date.now(),
): Promise<{ items: TrendingRepo[]; hasMore: boolean }> {
  if (page > MAX_PAGE) return { items: [], hasMore: false };

  const since = new Date(now - WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const q = encodeURIComponent(`created:>${since} stars:>50`);

  const res = await api<SearchResult>(
    `/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_PAGE}&page=${page}`,
  );

  return {
    items: res.items.map((r) => ({
      repo: r.full_name,
      owner: r.owner.login,
      avatar: r.owner.avatar_url,
      about: r.description ?? undefined,
      stars: r.stargazers_count,
      language: r.language ?? undefined,
      created: r.created_at,
      url: r.html_url,
    })),
    hasMore: res.items.length === PER_PAGE && page < MAX_PAGE,
  };
}
