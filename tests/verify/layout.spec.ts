import { test, expect } from "@playwright/test";
import type { Checkpoint, Block, Trait } from "../../src/index.js";
import { connect, runGraph, MemPage, checkpoint, Engine, start, end, defineLayout } from "../../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start_ = Checkpoint<"__start__">;
type PageA = Checkpoint<"PageA">;
type PageB = Checkpoint<"PageB">;

function block<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  name: string,
  tag: Out["__state"],
): Block<In, Out> {
  return {
    name,
    instruction: {
      async act() {},
      resolve: () => checkpoint(tag) as Out,
    },
  };
}

test.describe("Layout", () => {
  test("runGraph enforces a Layout's verify on the terminal Checkpoint it applies to", async () => {
    const sidebarGone: Trait = { name: "sidebar-visible", check: async () => false };
    const shell = defineLayout({
      name: "AppShell",
      appliesTo: ["PageA"],
      verify: [sidebarGone],
    });

    const entry = block<Start_, PageA>("nav-a", "PageA");
    const mem = new MemPage();

    await expect(
      runGraph<PageA>(entry, undefined, fakeContext, mem, 5000, { layouts: [shell] }),
    ).rejects.toThrow(/sidebar-visible.*AppShell/s);
  });

  test("runGraph skips a Layout whose appliesTo doesn't match the resolved Checkpoint", async () => {
    const wouldFail: Trait = { name: "never-true", check: async () => false };
    const shell = defineLayout({
      name: "AppShell",
      appliesTo: ["SomeOtherPage"],
      verify: [wouldFail],
    });

    const entry = block<Start_, PageA>("nav-a", "PageA");
    const mem = new MemPage();

    const result = await runGraph<PageA>(entry, undefined, fakeContext, mem, 5000, { layouts: [shell] });
    expect(result).toEqual(checkpoint("PageA"));
  });

  test("connect() enforces a Layout on an INTERMEDIATE Checkpoint, not just the final one", async () => {
    // Real gap this closes: buildFlow (Engine.defineFlow) reduces its whole
    // Block array into one connect()-composed super-Block, so runGraph's own
    // loop only ever sees ONE act call start to finish - it never observes
    // PageA's intermediate Checkpoint at all. Without threading layouts into
    // connect() itself, a Layout violation at an intermediate hop (PageA,
    // here) would silently pass as long as the FINAL hop (PageB) satisfied it.
    const sidebarGone: Trait = { name: "sidebar-visible", check: async () => false };
    const shell = defineLayout({
      name: "AppShell",
      appliesTo: ["PageA", "PageB"],
      verify: [sidebarGone],
    });

    const a = block<Start_, PageA>("nav-a", "PageA");
    const b = block<PageA, PageB>("nav-b", "PageB");
    const mem = new MemPage();

    const chain = connect(a, b, [shell]);
    await expect(runGraph(chain, undefined, fakeContext, mem)).rejects.toThrow(
      /sidebar-visible.*nav-a.*layout.*AppShell/s,
    );
  });

  test("Engine.defineFlow threads EngineConfig.layouts through every intermediate hop automatically", async () => {
    const sidebarGone: Trait = { name: "sidebar-visible", check: async () => false };
    const shell = defineLayout({
      name: "AppShell",
      appliesTo: ["PageA", "PageB"],
      verify: [sidebarGone],
    });

    const engine = new Engine({ layouts: [shell] });
    const a = block<Start_, PageA>("nav-a", "PageA");
    const b = block<PageA, PageB>("nav-b", "PageB");
    const flow = engine.defineFlow([start, a, b, end]);

    const mem = new MemPage();
    await expect(flow.run(fakeContext, mem)).rejects.toThrow(/sidebar-visible.*nav-a.*AppShell/s);
  });

  test("a passing Layout lets an Engine.defineFlow run proceed normally end to end", async () => {
    const sidebarVisible: Trait = { name: "sidebar-visible", check: async () => true };
    const shell = defineLayout({
      name: "AppShell",
      appliesTo: ["PageA", "PageB"],
      verify: [sidebarVisible],
    });

    const engine = new Engine({ layouts: [shell] });
    const a = block<Start_, PageA>("nav-a", "PageA");
    const b = block<PageA, PageB>("nav-b", "PageB");
    const flow = engine.defineFlow([start, a, b, end]);

    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("PageB"));
  });
});
