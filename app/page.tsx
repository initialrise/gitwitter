import { receivedEvents, viewer } from "@/lib/github";
import {
  buildCards,
  group,
  describe,
  byline,
  relative,
  BUCKETS,
  type Bucket,
} from "@/lib/feed";
import { hydrate } from "@/lib/hydrate";
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
  const cards = await hydrate(buildCards(events));
  const now = Date.now();

  const byBucket = group(cards);
  const view = Object.fromEntries(
    BUCKETS.map(({ id }) => [
      id,
      byBucket[id].map(
        (c): ViewCard => ({
          key: c.key,
          bucket: c.bucket,
          actors: c.actors.map((a) => ({
            login: a.login,
            avatar_url: a.avatar_url,
          })),
          byline: byline(c),
          repo: c.repo,
          own: c.own,
          subject: c.subject,
          count: c.count,
          ago: relative(c.newest, now),
          verb: describe(c),
          text: c.text,
        }),
      ),
    ]),
  ) as Record<Bucket, ViewCard[]>;

  const oldest = events.at(-1)?.created_at ?? new Date(now).toISOString();

  return (
    <Feed
      viewer={me}
      cards={view}
      window={{ from: relative(oldest, now), to: "now", events: events.length }}
    />
  );
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
