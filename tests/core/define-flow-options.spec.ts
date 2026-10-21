import { test, expect } from "@playwright/test";
import { Engine, start, end, checkpoint, withMemStub, withSessionReset, withTitle } from "../../src/index.js";
import type { Block, Checkpoint } from "../../src/index.js";

type A = Checkpoint<"A">;
const toA: Block<Checkpoint<"__start__">, A> = {
  name: "to-a",
  instruction: { async act() {}, resolve: () => checkpoint("A") },
};

test("defineFlow options give the same Flow as the with* wrappers", () => {
  const engine = new Engine();
  const viaOptions = engine.defineFlow([start, toA, end], { title: "T", memStub: true, sessionReset: true });
  const viaWrappers = withMemStub(withSessionReset(withTitle(engine.defineFlow([start, toA, end]), "T")));
  expect(viaOptions.title).toBe(viaWrappers.title);
  expect(viaOptions.memStub).toBe(true);
  expect(viaOptions.resetSession).toBe(true);
});

test("without options a Flow carries none of them", () => {
  const flow = new Engine().defineFlow([start, toA, end]);
  expect(flow.title).toBeUndefined();
  expect(flow.memStub).toBeFalsy();
});
