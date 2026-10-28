import { test, expect } from "@playwright/test";
import { MemPage, MemKey, registerMemStub, checkpoint, defineEffectBlock, type WaygraphInstanceOption } from "../../src/index.js";
import { optionChosen } from "../../src/live/auto/mem.js";
import type { BlockEntry } from "../../src/manifest/project.js";

// `reach` runs a per-row step (an Effect) only when mem already says which row.

const page = {} as import("@playwright/test").Page;
const effect = (key: MemKey<string>) => ({
  block: defineEffectBlock({
    name: "add-row",
    from: checkpoint("List"),
    to: checkpoint("List"),
    requires: [key],
    instruction: { async act() {} },
    async instanceOptions(): Promise<readonly WaygraphInstanceOption[]> {
      return [{ id: "a", label: "Add a", key, value: "a" }];
    },
  }),
}) as unknown as BlockEntry;

test("a row named in mem, or by a mem stub, is chosen; none is not", async () => {
  const given = new MemKey<string>("rows.given");
  const stubbed = new MemKey<string>("rows.stubbed");
  const none = new MemKey<string>("rows.none");
  registerMemStub(stubbed, () => "b");
  const mem = new MemPage();
  mem.set(given, "a");
  expect(await optionChosen(effect(given), page, mem)).toBe(true);
  expect(await optionChosen(effect(stubbed), page, mem)).toBe(true);
  expect(await optionChosen(effect(none), page, mem)).toBe(false);
});
