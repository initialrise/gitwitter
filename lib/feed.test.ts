import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCards, group, describe, byline, relative, bucketOf } from "./feed.ts";
import type { GhEvent } from "./github.ts";

/**
 * Run with: npm test
 * Fixture is a real 299-event, ~38h window from received_events, in which one
 * account (adysec) produced 96 push events to a single repo. That account is
 * the reason this project exists, so it is the thing worth asserting on.
 */

const events: GhEvent[] = JSON.parse(
  readFileSync(new URL("./__fixtures__/received_events.json", import.meta.url), "utf8"),
);

const cards = buildCards(events);
const buckets = group(cards);

// Collapse actually collapses.
assert.equal(events.length, 299);
assert.ok(cards.length < 150, `expected heavy collapse, got ${cards.length} cards`);

// The whole point: a burst account must not dominate the rendered feed.
const spamEvents = events.filter((e) => e.actor.login === "adysec").length;
const spamCards = cards.filter((c) => c.actor.login === "adysec").length;
assert.equal(spamEvents, 96);
assert.ok(
  spamCards <= 3,
  `96 burst events should collapse to a handful of cards, got ${spamCards}`,
);
assert.ok(
  spamCards / cards.length < 0.05,
  `burst account should be <5% of cards, got ${((spamCards / cards.length) * 100).toFixed(1)}%`,
);

// Every card is bucket-pure, so tabs never leak into each other.
for (const c of cards) {
  assert.ok(c.events.every((e) => bucketOf(e.type) === c.bucket), `${c.key} mixes buckets`);
  assert.ok(c.count === c.events.length);
  assert.ok(Date.parse(c.newest) >= Date.parse(c.oldest));
}

// Discussed cards are one thread each, so hydration is a single request.
for (const c of buckets.discussed) {
  const subjects = new Set(
    c.events.map((e) => e.payload.issue?.number ?? e.payload.pull_request?.number ?? e.payload.number),
  );
  assert.ok(subjects.size <= 1, `discussed card ${c.key} spans ${subjects.size} threads`);
}

// Pages of received_events overlap, so the raw feed contains duplicate ids.
const uniqueIds = new Set(events.map((e) => e.id));
assert.ok(uniqueIds.size < events.length, "fixture should contain page overlap");

// No event is lost, duplicated, or double-counted by bucketing.
const known = [...new Map(events.map((e) => [e.id, e])).values()].filter((e) =>
  bucketOf(e.type),
).length;
const kept = cards.reduce((n, c) => n + c.count, 0);
assert.equal(kept, known);
assert.equal(new Set(cards.flatMap((c) => c.events.map((e) => e.id))).size, known);
assert.equal(
  buckets.shipped.length + buckets.discussed.length + buckets.discovered.length,
  cards.length,
);

// Stars and forks aggregate by repo, so one popular repo is one card.
assert.equal(
  new Set(buckets.discovered.map((c) => c.repo)).size,
  buckets.discovered.length,
  "a repo must appear at most once in Discovered",
);
// Starring and forking the same repo is one interest, not two cards, and
// someone who did both is listed once.
for (const c of buckets.discovered) {
  assert.equal(new Set(c.actors.map((a) => a.login)).size, c.actors.length);
}
const both = buckets.discovered.find((c) => c.types.length > 1);
assert.ok(both, "expected a repo that was both starred and forked");
assert.match(describe(both!), /starred and forked|forked and starred/);
const crowd = buckets.discovered.find((c) => c.actors.length > 1);
assert.ok(crowd, "expected at least one repo starred by several people");
assert.match(byline(crowd!), /and (\d+ others|\w+)$/);
assert.equal(crowd!.own, false);

// Elsewhere the person stays the subject: never merge two people onto one card.
for (const c of [...buckets.shipped, ...buckets.discussed]) {
  assert.equal(c.actors.length, 1, `${c.key} merged multiple actors`);
}

// Ownership badge.
const own = cards.find((c) => c.repo.split("/")[0] === c.actor.login);
assert.ok(own?.own === true);

// Gap window is honoured: a tiny gap must split a long streak apart.
assert.ok(buildCards(events, 1000).length > cards.length);

// Copy.
const push = buckets.shipped.find((c) => c.count > 1);
assert.match(describe(push!), /pushed \d+ times/);
assert.equal(relative("2026-08-08T00:00:00Z", Date.parse("2026-08-08T03:30:00Z")), "3h");
assert.equal(relative("2026-08-06T00:00:00Z", Date.parse("2026-08-08T00:00:00Z")), "2d");

console.log(
  `ok — ${events.length} events → ${cards.length} cards ` +
    `(shipped ${buckets.shipped.length}, discussed ${buckets.discussed.length}, discovered ${buckets.discovered.length}); ` +
    `adysec ${spamEvents} events → ${spamCards} cards`,
);
