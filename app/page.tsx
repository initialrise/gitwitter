import { receivedEvents, viewer } from "@/lib/github";
import {
  buildCards,
  group,
  describe,
  byline,
  bylineOf,
  relative,
  BUCKETS,
  type Bucket,
} from "@/lib/feed";
import { hydrate } from "@/lib/hydrate";
import { recommend } from "@/lib/recommend";
import { trending } from "@/lib/trending";
import { Feed } from "@/components/Feed";
import type { ViewCard } from "@/components/CardView";

// We shell out to `gh` on every request; there is nothing to prerender.
export const dynamic = "force-dynamic";

export default async function Page() {
  let me: string;
  try {
    me = await viewer();
  } catch {
    return <Setup />;
  }

  const events = await receivedEvents(me);
  const now = Date.now();

  // Independent of each other, so do not make the user wait for them in turn.
  const [cards, recs, hot] = await Promise.all([
    hydrate(buildCards(events)),
    recommend(events, me),
    trending(1, now).then((t) => t.items),
  ]);

  const byBucket = group(cards);
  const view = Object.fromEntries(
    BUCKETS.map(({ id }) => [
      id,
      byBucket[id].map((c): ViewCard => toView(c, now)),
    ]),
  ) as Record<Bucket, ViewCard[]>;

  const forYou: ViewCard[] = recs.map((r) => ({
    key: `rec|${r.repo}`,
    bucket: "discovered",
    actors: r.actors.map((a) => ({
      login: a.login,
      avatar_url: a.avatar_url,
    })),
    byline: bylineOf(r.actors),
    repo: r.repo,
    own: false,
    subject: null,
    count: 0,
    ago: relative(r.newest, now),
    verb: "picked this up",
    reason: r.reason,
    language: r.language,
    text: { about: r.about, stars: r.stars, url: `https://github.com/${r.repo}` },
  }));

  const oldest = events.at(-1)?.created_at ?? new Date(now).toISOString();

  return (
    <Feed
      viewer={me}
      cards={{ ...view, foryou: forYou }}
      trending={hot}
      window={{ from: relative(oldest, now), events: events.length }}
    />
  );
}

function toView(
  c: ReturnType<typeof buildCards>[number],
  now: number,
): ViewCard {
  return {
    key: c.key,
    bucket: c.bucket,
    actors: c.actors.map((a) => ({ login: a.login, avatar_url: a.avatar_url })),
    byline: byline(c),
    repo: c.repo,
    own: c.own,
    subject: c.subject,
    count: c.count,
    ago: relative(c.newest, now),
    verb: describe(c),
    text: c.text,
  };
}

function Setup() {
  return (
    <main className="mx-auto max-w-[600px] px-6 py-24">
      <h1 className="text-xl font-bold">gitwitter</h1>
      <p className="mt-3 text-[15px] leading-6 text-muted">
        Could not reach GitHub. This app reads your following feed through the{" "}
        <code className="text-ink">gh</code> CLI, which holds your token in the
        OS keyring — nothing is stored here.
      </p>
      <pre className="mt-4 rounded-lg border border-line bg-surface p-4 text-[13px] text-ink">
        gh auth login
      </pre>
    </main>
  );
}
