import type { GhEvent } from "./github.ts";

export type Bucket = "shipped" | "discussed" | "discovered";

export const BUCKETS: { id: Bucket; label: string; blurb: string }[] = [
  { id: "shipped", label: "Shipped", blurb: "code that landed" },
  { id: "discussed", label: "Discussed", blurb: "PRs, issues, reviews" },
  { id: "discovered", label: "Discovered", blurb: "stars and forks" },
];

const BUCKET_OF: Record<string, Bucket> = {
  PushEvent: "shipped",
  ReleaseEvent: "shipped",
  CreateEvent: "shipped",
  PullRequestEvent: "discussed",
  PullRequestReviewEvent: "discussed",
  PullRequestReviewCommentEvent: "discussed",
  IssueCommentEvent: "discussed",
  IssuesEvent: "discussed",
  CommitCommentEvent: "discussed",
  WatchEvent: "discovered",
  ForkEvent: "discovered",
};

export function bucketOf(type: string): Bucket | null {
  return BUCKET_OF[type] ?? null;
}

/** The issue/PR a "discussed" event is about, so replies to the same thread group together. */
export function subjectOf(e: GhEvent): number | null {
  return (
    e.payload.issue?.number ??
    e.payload.pull_request?.number ??
    e.payload.number ??
    null
  );
}

export type Card = {
  key: string;
  bucket: Bucket;
  actor: GhEvent["actor"];
  /** everyone in the group — >1 only for stars/forks, which aggregate by repo */
  actors: GhEvent["actor"][];
  repo: string;
  /** repo belongs to the actor themselves, rather than someone else */
  own: boolean;
  subject: number | null;
  events: GhEvent[];
  count: number;
  newest: string;
  oldest: string;
  /** distinct event types in the group, most frequent first */
  types: string[];
  text?: CardText;
};

export type CardText = {
  title?: string;
  url?: string;
  body?: string;
  /** commit subject lines, for shipped cards */
  commits?: string[];
  /** repo description, for discovered cards */
  about?: string;
  stars?: number;
};

/** Consecutive activity by the same person on the same thing, within `gapMs`. */
const GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Gap-based, not fixed-bucket: each event extends the group if it is within
 * `gapMs` of the previous one. A continuously active account therefore
 * collapses into a single card no matter how long the streak runs — which is
 * exactly what stops one noisy account from owning the feed.
 */
export function buildCards(events: GhEvent[], gapMs = GAP_MS): Card[] {
  // Pages of received_events overlap: the same event id shows up twice.
  const unique = [...new Map(events.map((e) => [e.id, e])).values()];
  const sorted = unique.sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  const cards: Card[] = [];
  const open = new Map<string, Card>();

  for (const e of sorted) {
    const bucket = bucketOf(e.type);
    if (!bucket) continue;

    const subject = bucket === "discussed" ? subjectOf(e) : null;

    // Stars and forks are about the repo, not the person — everyone who took
    // an interest lands on one card ("X and 5 others"), the way Twitter folds
    // likes. Elsewhere the person is the subject, so the key is the actor.
    const key =
      bucket === "discovered"
        ? `${bucket}|${e.repo.name}`
        : `${e.actor.login}|${e.repo.name}|${bucket}|${subject ?? ""}`;

    const prev = open.get(key);

    // The gap window models one person's working session, so it does not apply
    // to a repo card: strangers finding the same repo hours apart is the
    // normal case, not a burst, and splitting on it just shows the repo twice.
    const continues =
      prev &&
      (bucket === "discovered" ||
        Date.parse(prev.oldest) - Date.parse(e.created_at) < gapMs);

    if (prev && continues) {
      prev.events.push(e);
      prev.count++;
      prev.oldest = e.created_at;
      if (!prev.actors.some((a) => a.login === e.actor.login)) {
        prev.actors.push(e.actor);
        prev.own = false; // meaningless once a card has several authors
      }
      continue;
    }

    const card: Card = {
      key: `${key}|${e.id}`,
      bucket,
      actor: e.actor,
      actors: [e.actor],
      repo: e.repo.name,
      own:
        e.repo.name.split("/")[0].toLowerCase() === e.actor.login.toLowerCase(),
      subject,
      events: [e],
      count: 1,
      newest: e.created_at,
      oldest: e.created_at,
      types: [],
    };
    cards.push(card);
    open.set(key, card);
  }

  for (const c of cards) c.types = rankTypes(c.events);
  return cards;
}

function rankTypes(events: GhEvent[]): string[] {
  const n = new Map<string, number>();
  for (const e of events) n.set(e.type, (n.get(e.type) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export function group(cards: Card[]): Record<Bucket, Card[]> {
  return {
    shipped: cards.filter((c) => c.bucket === "shipped"),
    discussed: cards.filter((c) => c.bucket === "discussed"),
    discovered: cards.filter((c) => c.bucket === "discovered"),
  };
}

const VERB: Record<string, (n: number, a?: string) => string> = {
  PushEvent: (n) => (n === 1 ? "pushed" : `pushed ${n} times`),
  ReleaseEvent: () => "released",
  CreateEvent: () => "created",
  PullRequestEvent: (n, a) =>
    a === "opened" ? "opened a pull request" : a === "merged" ? "merged" : a === "closed" ? "closed" : "updated",
  PullRequestReviewEvent: () => "reviewed",
  PullRequestReviewCommentEvent: (n) => (n === 1 ? "commented on a review" : `left ${n} review comments`),
  IssueCommentEvent: (n) => (n === 1 ? "commented" : `commented ${n} times`),
  IssuesEvent: (n, a) => (a === "opened" ? "opened an issue" : a === "closed" ? "closed an issue" : "updated an issue"),
  CommitCommentEvent: () => "commented on a commit",
  WatchEvent: () => "starred",
  ForkEvent: () => "forked",
};

/** "pushed 12 times", "opened a pull request", "starred" */
export function describe(card: Card): string {
  const parts = card.types.map((t) => {
    const of = card.events.filter((e) => e.type === t);
    const action = of[0].payload.action;
    return (VERB[t] ?? (() => t.replace("Event", "")))(of.length, action);
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "IsaacG", "IsaacG and ageron", "IsaacG and 5 others" */
export function bylineOf(actors: GhEvent["actor"][]): string {
  const [first, second] = actors;
  if (!first) return "";
  if (actors.length === 1) return first.login;
  if (actors.length === 2) return `${first.login} and ${second.login}`;
  return `${first.login} and ${actors.length - 1} others`;
}

export function byline(card: Card): string {
  return bylineOf(card.actors);
}

export function relative(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
