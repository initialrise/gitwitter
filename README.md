# gitwitter

Your GitHub following feed, read like Twitter — without the one account that
floods it.

GitHub's following feed is reverse-chronological and unweighted, so a single
prolific account can own entire pages of it. In the window this was built
against, one account produced **96 of 299 events**, all pushes to one repo,
arriving in bursts that swallowed whole pages.

gitwitter collapses that account into **one card** and sorts the rest into three
tabs.

```
299 events  →  111 cards
              shipped 2 · discussed 77 · discovered 32
              the noisy account: 96 events → 2 cards
```

## Running it

Requires the [`gh` CLI](https://cli.github.com/), logged in:

```bash
gh auth login     # if you haven't
npm install
npm run dev       # http://localhost:3000
npm test          # grouping self-check, no network
```

There is no config, no `.env`, and no token in this repo. `gh auth token` is
read once per process from the OS keyring and used for plain HTTP after that.
`lib/github.ts` is the only file that knows how auth happens, so that is the
one seam to replace if this ever goes multi-user.

Cold load is ~5s (roughly 120 API calls, run in parallel), then ~0.2s from the
in-process cache until you restart it.

## How it works

**Fetch.** `GET /users/{you}/received_events`, three pages. GitHub caps this
feed at 300 events and rejects page 4 outright, so ~300 events (1–2 days) is
the entire history available. Nothing is stored; there is no database and
nothing to keep in sync. Pages overlap and repeat event ids, so they are
deduped on the way in.

**Collapse.** Consecutive activity by the same person on the same thing folds
into one card. The window is *gap-based*, not a fixed bucket: each event
extends the group if it lands within 6h of the last one. A continuously active
account therefore collapses into a single card no matter how long the streak
runs — which is precisely what stops it owning the feed.

The grouping key differs by tab, because the subject differs:

| Tab | Key | Window | Reads as |
|---|---|---|---|
| Shipped | actor + repo | 6h gap | "adysec pushed 95 times to adysec/AVE" |
| Discussed | actor + repo + issue/PR | 6h gap | "IsaacG on roc-test-runner#50 — commented ×2, reviewed" |
| Discovered | repo | whole feed | "l00tcris and 2 others forked and starred TREVORspray" |

Stars and forks fold by *repo* rather than by person, the way Twitter folds
likes — 17 people starring one repo is one card, not 17. The gap window does
**not** apply there: it models one person's working session, and strangers
finding the same repo hours apart is the normal case, not a burst. Starring and
forking count as the same interest, so someone who did both is listed once.

**Buckets.** Three of the five tabs map onto Twitter's own trichotomy:

| Tab | Twitter analogue | Events |
|---|---|---|
| Shipped | original posts | Push, Release, Create |
| Discussed | replies | PR, Review, ReviewComment, IssueComment, Issues |
| Discovered | likes / reposts | Watch, Fork |

Repo ownership ("did they push to their own repo or contribute to someone
else's") is a badge on the card rather than another tab.

## For you

GitHub has no public recommendations API. `/user/recommendations`,
`/user/suggestions` and `/repositories/recommended` all 404, and the GraphQL
schema exposes nothing beyond reviewer and list suggestions — github.com's own
"For you" is internal.

So this reproduces the *signal* rather than the endpoint, which is ordinary
collaborative filtering: repos that people you follow are converging on, minus
anything you have already starred. The entire input is the feed you already
fetched; the only extra reads are your own stars.

Acts are weighted by how much they cost the person — forking or opening a PR
(3) says more than starring (2), which says more than pushing (1, often just
their day job). Each person counts once, at the strongest thing they did.
Score is `sum(weights) × √(people)`, so breadth of agreement beats depth: three
people starring outranks two people forking. Bots, your own repos, and authors
boosting their own work are all excluded.

```
225  ★108   JavaScript  Arcanum-Sec/wraith      22 people starred, 1 forked
 14  ★1.4k  Python      .../TREVORspray          2 forked, 2 starred
 12  ★357   Ruby        exercism/problem-specs   3 contributed to
```

## Trending

Also no API — `/trending` and `/repositories/trending` 404, and the page itself
is HTML. Its real metric is *star velocity*, which the search API cannot
express at all.

The approximation: repos created in the last 30 days with >50 stars, ranked by
stars. Young and already popular is most of what trending means in practice.
Unlike everything else here it is not personalised — it is the same list for
everybody.

This is the one tab that scrolls infinitely, because search paginates properly
(2000+ matches). An `IntersectionObserver` fetches the next page 600px before
the sentinel is visible, repeats are dropped as results shift under you, and it
stops at 1000 results because that is where GitHub search stops.

**Hydrate.** GitHub strips the events payloads, and this is the single biggest
constraint on the UI:

```
IssuesEvent        18/18  ✓ full title
IssueCommentEvent  32/32  ✓ title + comment body
PullRequestEvent    0/45  ✗ no title — only url, id, number, head, base
PullRequestReview   0/34  ✗ no PR title
PushEvent           0/96  ✗ no commits array, no size — only SHAs
```

Only 50 of 299 events carry readable text. The rest are a verb, a number and a
URL — an avatar next to the word "pushed". So cards are hydrated after
collapsing, one request *per card* rather than per event: a push card resolves
via `compare/{before}...{head}` (95 pushes = one request, and it returns every
commit message in the range), a PR card via `pulls/{n}`, a star card via the
repo's description and star count. Roughly 70 requests against a 5000/hr limit.
Failures degrade that one card to its untexted form — repos go private and get
deleted, and a 404 must not take the page down.

## Deliberate omissions

**No ranking algorithm.** The original plan was a Twitter-style scoring feed.
The data killed it: collapsing alone took the noisy account from 32% of events
to under 2% of cards, and 111 cards over ~38 hours is a quantity you can simply
read. Twitter's algorithm also runs on engagement signals — likes, replies,
dwell time — that the GitHub events API does not have. Add scoring when
reverse-chronological actually fails.

**No releases or discussions tab.** `ReleaseEvent` is real but nobody shipped
one in the observed window, so the tab would usually be empty.
`DiscussionEvent` does not exist in the Events API at all — discussions are
absent from the firehose, not merely rare. Surfacing them would mean polling
GraphQL per repo, which reintroduces the per-repo polling this design avoids.

**No refresh button, and no infinite scroll outside Trending.** Reload the
page; the feed tabs only ever hold ~300 events, and the footer says so.

**Single dark theme.** It is a personal feed reader, not a product that needs
to match anyone's OS.
