import { test } from "node:test";
import assert from "node:assert/strict";
import { viewOf } from "../../src/demo/stepper/step-calls.js";
import { networkFindings } from "../../src/analysis/network-check.js";

const detail = { runId: "r", step: 0, summary: { source: "api", method: "POST", url: "http://a/posts", route: "/posts", status: 201, ms: 5, failed: false }, bodies: { request: {}, response: { status: 201 } } } as never;

test("the config's names rename a call, and its thresholds move a finding", () => {
  assert.equal(viewOf(detail).name, "POST /posts");
  process.env["WAYGRAPH_CALL_NAMES"] = JSON.stringify({ "POST /posts": "Seed the note" });
  assert.equal(viewOf(detail).name, "Seed the note");
  delete process.env["WAYGRAPH_CALL_NAMES"];
  const events = [{ type: "step:call", runId: "r", at: 0, index: 0, source: "page", method: "GET", url: "http://a/s", route: "/s", status: 200, ms: 300, failed: false }] as never;
  assert.equal(networkFindings(events).length, 0);
  assert.equal(networkFindings(events, { slowMs: 100 }).length, 1);
});
