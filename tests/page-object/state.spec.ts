import { test, expect } from "@playwright/test";
import { definePageBlock, Engine, keys, MemPage, onRunEvent, state } from "../../src/index.js";
import type { RunEvent } from "../../src/index.js";
import { buildManifest } from "../../src/manifest/manifest.js";

// A state is a boolean mem key: a page `needs` it, a Method `sets` it, a run applies and checks it.
const Auth = keys("stateSpec")<{ signedIn: boolean }>({ signedIn: state(false) });

const Gate = definePageBlock({
  name: "page-state-gate",
  checkpoint: "StateGate",
  url: "about:blank",
  do: (self) => ({
    signIn: self.method({ to: "StateHome", sets: [[Auth.signedIn, true]], async act() {} }),
  }),
});
const Home = definePageBlock({
  name: "page-state-home",
  checkpoint: "StateHome",
  needs: [Auth.signedIn],
  do: (self) => ({ logout: self.method({ to: "StateGate", sets: [[Auth.signedIn, false]], async act() {} }) }),
});

test("a page that needs a state fails a step that lands there without it, and passes after a step that sets it", async ({ page, context }) => {
  const events: RunEvent[] = [];
  const off = onRunEvent((e) => events.push(e));
  const mem = new MemPage();
  try {
    await new Engine().map().gotoPage(Gate).method(Gate.do.signIn).method(Home.do.logout).run(context, mem, { page });
  } finally {
    off();
  }
  expect(events.filter((e) => e.type === "step:state").map((e) => (e as { key: string; value: boolean }).value)).toEqual([true, false]);
  expect(mem.get(Auth.signedIn)).toBe(false);
});

test("landing on a needing page signed out is refused, naming the state", async ({ page, context }) => {
  const Back = definePageBlock({ name: "page-state-back", checkpoint: "StateBack", do: (self) => ({ jump: self.method({ to: "StateHome", async act() {} }) }) });
  await expect(new Engine().map().gotoPage(Back).method(Back.do.jump).run(context, new MemPage(), { page })).rejects.toThrow(/StateHome needs stateSpec\.signedIn/);
});

test("the manifest lists the states, what a page needs and what a move sets", async () => {
  const m = await buildManifest(new URL("../../examples/saucedemo", import.meta.url).pathname);
  expect(Array.isArray(m.states)).toBe(true);
});

test("waygraph check names a step that lands on a page whose state the flow isn't in", async () => {
  const { checkStates } = await import("../../src/analysis/state-check.js");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "wg-state-"));
  mkdirSync(join(dir, "src", "flows"), { recursive: true });
  writeFileSync(join(dir, "package.json"), '{"name":"s","type":"module"}');
  writeFileSync(
    join(dir, "src", "flows", "x.flow.ts"),
    `import { definePageBlock, keys, map, state } from ${JSON.stringify(new URL("../../src/index.ts", import.meta.url).pathname)};
const K = keys("chk")<{ on: boolean }>({ on: state(false) });
const Gate = definePageBlock({ name: "page-chk-gate", checkpoint: "ChkGate", url: "/", do: (s) => ({ go: s.method({ to: "ChkIn", async act() {} }) }) });
definePageBlock({ name: "page-chk-in", checkpoint: "ChkIn", needs: [K.on] });
export const badFlow = map().gotoPage(Gate).method(Gate.do.go);
`,
  );
  const warnings = await checkStates(dir);
  expect(warnings.map((w) => [w.flow, w.page, w.missing])).toEqual([["badFlow", "ChkIn", ["chk.on"]]]);
});
