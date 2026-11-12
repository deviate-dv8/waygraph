import { test } from "node:test";
import assert from "node:assert/strict";
import { networkFindings } from "../../src/analysis/network-check.js";
import type { RunEvent } from "../../src/engine/run/events.js";

const call = (over: Record<string, unknown>): RunEvent =>
  ({ type: "step:call", runId: "r", at: 0, index: 0, source: "page", method: "GET", url: "http://a/x", route: "/x", status: 200, ms: 10, failed: false, ...over }) as RunEvent;
const landed = { type: "step:end", runId: "r", at: 0, index: 0, block: "b", kind: "page", to: "Items", ms: 1 } as RunEvent;

test("a page's calls: duplicates, N+1, slow, large, failed; other origins left out", () => {
  const events: RunEvent[] = [
    call({}), call({}),
    ...[1, 2, 3, 4, 5].map((i) => call({ url: `http://a/items/${i}`, route: "/items/:id" })),
    call({ url: "http://a/slow", route: "/slow", ms: 2500 }),
    call({ url: "http://a/big", route: "/big", size: 300_000, cacheable: true }),
    call({ url: "http://a/gone", route: "/gone", status: 404, failed: true }),
    call({ url: "http://cdn/x", route: "/x", external: true, ms: 9000 }),
    landed,
  ];
  const kinds = networkFindings(events).map((f) => f.kind).sort();
  assert.deepEqual(kinds, ["duplicate", "failed", "large", "n+1", "slow"]);
  assert.ok(networkFindings(events).every((f) => f.page === "Items"));
});

test("a quiet page has no findings", () => {
  assert.deepEqual(networkFindings([call({}), landed]), []);
});
