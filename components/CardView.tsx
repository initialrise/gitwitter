import type { Bucket, CardText } from "@/lib/feed";
import type { TrendingRepo } from "@/lib/trending";

export type ViewCard = {
  key: string;
  bucket: Bucket;
  actors: { login: string; avatar_url: string }[];
  byline: string;
  repo: string;
  own: boolean;
  subject: number | null;
  count: number;
  ago: string;
  verb: string;
  text?: CardText;
  /** why this was recommended — "3 people starred, 1 forked" */
  reason?: string;
  language?: string;
};

export function CardView({ card }: { card: ViewCard }) {
  const href =
    card.text?.url ??
    (card.subject
      ? `https://github.com/${card.repo}/issues/${card.subject}`
      : `https://github.com/${card.repo}`);

  return (
    <li className="border-b border-line transition-colors hover:bg-surface/40">
      <a href={href} target="_blank" rel="noreferrer" className="flex gap-3 px-4 py-3">
        <div className="flex shrink-0 -space-x-2">
          {card.actors.slice(0, 3).map((a) => (
            <img
              key={a.login}
              src={a.avatar_url}
              alt=""
              width={40}
              height={40}
              title={a.login}
              className="h-10 w-10 rounded-full bg-surface ring-2 ring-bg"
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-5">
            <span className="font-bold hover:underline">{card.byline}</span>
            <span className="text-muted">
              {card.verb} · {card.ago}
            </span>
          </p>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[15px] leading-5">
            <Icon bucket={card.bucket} />
            <span className="min-w-0 truncate font-medium text-brand">
              {card.repo}
            </span>
            {card.own && (
              <span className="rounded border border-line px-1 text-[11px] text-muted">
                own repo
              </span>
            )}
            {card.subject != null && (
              <span className="text-muted">#{card.subject}</span>
            )}
          </p>

          {card.text?.title && (
            <p className="mt-1.5 text-[15px] leading-5 font-medium text-ink">
              {card.text.title}
            </p>
          )}

          {card.text?.about && (
            <p className="mt-1.5 text-[15px] leading-5 text-muted">
              {card.text.about}
            </p>
          )}

          {card.text?.body && (
            <p className="mt-1.5 border-l-2 border-line pl-3 text-[15px] leading-5 text-muted">
              {card.text.body}
            </p>
          )}

          {card.text?.commits && (
            <ul className="mt-1.5 space-y-0.5">
              {card.text.commits.map((c, i) => (
                <li
                  key={i}
                  className="truncate font-mono text-[13px] leading-5 text-muted"
                >
                  <span className="text-ship">·</span> {c}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {card.count > 1 && <span>{card.count} events</span>}
            {card.language && <span>{card.language}</span>}
            {card.text?.stars != null && (
              <span className="text-star">★ {fmt(card.text.stars)}</span>
            )}
            {card.reason && <span>{card.reason}</span>}
          </div>
        </div>
      </a>
    </li>
  );
}

/** Trending has no social context — no actors, no verb, just the repo. */
export function RepoRow({ repo }: { repo: TrendingRepo }) {
  return (
    <li className="border-b border-line transition-colors hover:bg-surface/40">
      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="flex gap-3 px-4 py-3"
      >
        <img
          src={repo.avatar}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full bg-surface"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5">
            <span className="font-bold">{repo.owner}</span>
            <span className="text-muted">/</span>
            <span className="font-bold">{repo.repo.split("/")[1]}</span>
          </p>
          {repo.about && (
            <p className="mt-0.5 text-[15px] leading-5 text-muted">
              {repo.about}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span className="text-star">★ {fmt(repo.stars)}</span>
            {repo.language && <span>{repo.language}</span>}
          </div>
        </div>
      </a>
    </li>
  );
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function Icon({ bucket }: { bucket: Bucket }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (bucket === "shipped")
    return (
      <svg viewBox="0 0 16 16" className={`${cls} fill-ship`} aria-hidden>
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a3 3 0 110 6 3 3 0 010-6z" />
      </svg>
    );
  if (bucket === "discovered")
    return (
      <svg viewBox="0 0 16 16" className={`${cls} fill-star`} aria-hidden>
        <path d="M8 .5l2.2 4.6 5 .7-3.6 3.5.9 5L8 12l-4.5 2.3.9-5L.8 5.8l5-.7L8 .5z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 16 16" className={`${cls} fill-brand`} aria-hidden>
      <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3V3z" />
    </svg>
  );
}
