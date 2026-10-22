import { test, expect } from "@playwright/test";
import { defineNavBlock, Engine, checkpoint, defineMethodBlock } from "../../src/index.js";
import type { Checkpoint } from "../../src/index.js";

type Home = Checkpoint<"Home">;

test("map() step pace sets the Block's demoPace and keeps its runtime markers, Nav from included", () => {
  const nav = defineNavBlock<Home>({ name: "nav-home", checkpoint: "Home", url: "/", from: ["Login"] });
  const act = defineMethodBlock<Home, Home>({
    name: "act",
    instruction: { async act() {}, resolve: () => checkpoint("Home") },
  });
  const flow = new Engine()
    .map()
    .start()
    .gotoPage(nav, { pace: "slow" })
    .method(act, { pace: "blitz" })
    .end();
  const [navStep, actStep] = flow.blocks().map((info) => (info as unknown as { block: object }).block);
  expect((navStep as unknown as { demoPace: string }).demoPace).toBe("slow");
  expect((actStep as unknown as { demoPace: string }).demoPace).toBe("blitz");
  expect((navStep as unknown as { __waygraphNavFrom?: string[] }).__waygraphNavFrom).toEqual(["Login"]);
  const salt = (b: object): unknown => (b as { __waygraphSalt?: unknown }).__waygraphSalt;
  expect(salt(act)).toBeDefined();
  expect(salt(actStep!)).toBe(salt(act));
});

test("chaining a stub on a Nav keeps its `from`", () => {
  const nav = defineNavBlock<Home>({ name: "nav-home", checkpoint: "Home", url: "/", from: ["Login"] }).stubAfter(() => {});
  expect((nav as unknown as { __waygraphNavFrom?: string[] }).__waygraphNavFrom).toEqual(["Login"]);
});
