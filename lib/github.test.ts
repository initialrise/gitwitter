import assert from "node:assert/strict";
import { api, receivedEvents, TTL_MS } from "./github.ts";

/**
 * Run with: npm test
 * The cache must share results within a page load but expire, or a reload
 * never shows new activity. fetch and the clock are stubbed; no network.
 */

let calls = 0;
let status = 200;
globalThis.fetch = (async () => {
  calls++;
  return new Response("[]", { status });
}) as typeof fetch;

let now = 1_000_000;
Date.now = () => now;

await api("/x");
await api("/x");
assert.equal(calls, 1, "repeat within TTL is served from cache");

now += TTL_MS;
await api("/x");
assert.equal(calls, 2, "expired entry is refetched");

status = 500;
await assert.rejects(receivedEvents("me"), "all pages failing is an error, not an empty feed");
await assert.rejects(api("/y"));
await assert.rejects(api("/y"));
assert.equal(calls, 2 + 3 + 2, "failures are not cached");

console.log("ok — cache expires after", TTL_MS / 1000, "s");
