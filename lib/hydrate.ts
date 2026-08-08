import { apiOrNull } from "./github.ts";
import type { Card, CardText } from "./feed.ts";

/**
 * GitHub strips the events API payloads: pushes carry no commit messages and
 * PR events carry no title. Without filling those in, a card is an avatar
 * next to a verb. We fetch per *card*, not per event, so one noisy account's
 * 95 pushes cost a single request.
 */

// Plain HTTP now, so the ceiling is GitHub's rather than local process spawning.
const CONCURRENCY = 16;

export async function hydrate(cards: Card[]): Promise<Card[]> {
  const queue = [...cards];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let card = queue.shift(); card; card = queue.shift()) {
      card.text = (await textFor(card)) ?? undefined;
    }
  });
  await Promise.all(workers);
  return cards;
}

async function textFor(card: Card): Promise<CardText | null> {
  try {
    if (card.bucket === "shipped") return await shippedText(card);
    if (card.bucket === "discussed") return await discussedText(card);
    return await discoveredText(card);
  } catch {
    return null; // a dead repo degrades the card, it does not break the feed
  }
}

type Compare = { commits: { commit: { message: string } }[]; html_url: string };

async function shippedText(card: Card): Promise<CardText | null> {
  const newest = card.events[0];
  const oldest = card.events[card.events.length - 1];
  const base = oldest.payload.before;
  const head = newest.payload.head;
  if (!base || !head) return null;

  // A force-push makes this range invalid; apiOrNull turns that into a plain card.
  const cmp = await apiOrNull<Compare>(
    `/repos/${card.repo}/compare/${base}...${head}`,
  );
  if (!cmp?.commits?.length) return null;

  return {
    url: cmp.html_url,
    commits: cmp.commits
      .slice(-3)
      .reverse()
      .map((c) => c.commit.message.split("\n")[0].slice(0, 120)),
  };
}

async function discussedText(card: Card): Promise<CardText | null> {
  const withIssue = card.events.find((e) => e.payload.issue?.title);
  const comment = card.events.find((e) => e.payload.comment?.body)?.payload
    .comment?.body;
  const reviewBody = card.events.find((e) => e.payload.review?.body)?.payload
    .review?.body;
  const body = trim(comment ?? reviewBody);

  if (withIssue?.payload.issue) {
    const issue = withIssue.payload.issue;
    return { title: issue.title, url: issue.html_url, body };
  }

  if (card.subject == null) return body ? { body } : null;

  const pr = await apiOrNull<{ title: string; html_url: string }>(
    `/repos/${card.repo}/pulls/${card.subject}`,
  );
  if (!pr) return body ? { body } : null;
  return { title: pr.title, url: pr.html_url, body };
}

async function discoveredText(card: Card): Promise<CardText | null> {
  const repo = await apiOrNull<{
    description: string | null;
    stargazers_count: number;
  }>(`/repos/${card.repo}`);
  if (!repo) return null;
  return {
    about: repo.description ?? undefined,
    stars: repo.stargazers_count,
  };
}

function trim(body?: string): string | undefined {
  if (!body) return undefined;
  const t = body.trim().replace(/\s+/g, " ");
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}
