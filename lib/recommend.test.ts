import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rank } from "./recommend.ts";
import type { GhEvent } from "./github.ts";

/**
 * Run with: npm test
 * Only the pure half is covered — `recommend` additionally reads your stars
 * and repo metadata over the network.
 */

const events: GhEvent[] = JSON.parse(
  readFileSync(new URL("./__fixtures__/received_events.json", import.meta.url), "utf8"),
);

const ME = "initialrise";
const none = new Set<string>();
const recs = rank(events, ME, none, 50);

assert.ok(recs.length > 0, "fixture should produce recommendations");

// Never recommend something you already have, whatever case it is written in.
const top = recs[0].repo;
const filtered = rank(events, ME, new Set([top.toUpperCase().toLowerCase()]), 50);
assert.ok(
  !filtered.some((r) => r.repo === top),
  "a starred repo must not be recommended",
);
assert.equal(filtered.length, recs.length - 1);

// Your own repos are not discoveries, and nobody boosts their own repo.
for (const r of recs) {
  assert.notEqual(r.repo.split("/")[0].toLowerCase(), ME.toLowerCase());
  for (const a of r.actors) {
    assert.notEqual(
      a.login.toLowerCase(),
      r.repo.split("/")[0].toLowerCase(),
      `${a.login} boosted their own repo ${r.repo}`,
    );
    assert.ok(!a.login.endsWith("[bot]"), `bot ${a.login} counted as a signal`);
  }
}

// One person is counted once however many times they acted.
for (const r of recs) {
  assert.equal(new Set(r.actors.map((a) => a.login)).size, r.actors.length);
}

// Ranked, and breadth of agreement wins: the repo the most people converged on
// must come first, ahead of anything a single person did.
for (let i = 1; i < recs.length; i++) {
  assert.ok(recs[i - 1].score >= recs[i].score, "not sorted by score");
}
const widest = recs.reduce((a, b) => (b.actors.length > a.actors.length ? b : a));
assert.equal(recs[0].repo, widest.repo, "widest agreement should rank first");
assert.ok(recs[0].actors.length > 1);

// Breadth beats depth at equal total weight: 3 people starring (2+2+2) must
// outrank 2 people forking (3+3), because agreement is the signal.
const synthetic: GhEvent[] = [
  ...["a", "b", "c"].map((login, i) => ev(`${i}`, "WatchEvent", login, "org/wide")),
  ...["d", "e"].map((login, i) => ev(`1${i}`, "ForkEvent", login, "org/deep")),
];
const s = rank(synthetic, ME, none);
assert.equal(s[0].repo, "org/wide");
assert.match(s[0].reason, /3 people starred — from people you follow/);
assert.match(s[1].reason, /2 people forked/);

// Singular/plural.
const one = rank([ev("9", "ForkEvent", "solo", "org/x")], ME, none);
assert.match(one[0].reason, /^1 person forked/);

function ev(id: string, type: string, login: string, repo: string): GhEvent {
  return {
    id,
    type,
    actor: { login, avatar_url: `https://avatars/${login}` },
    repo: { id: 1, name: repo, url: "" },
    created_at: "2026-08-08T00:00:00Z",
    payload: {},
  };
}

console.log(
  `ok — ${recs.length} recommendations; top: ${recs[0].repo} ` +
    `(${recs[0].actors.length} people, score ${Math.round(recs[0].score)})`,
);
