import { test, expect } from "@playwright/test";
import type { Checkpoint } from "../../src/index.js";
import {
  Engine,
  MemPage,
  checkpoint,
  keys,
  defineNavBlock,
  defineExpectBlock,
  defineMethodBlock,
  registerMemStub,
  seedMemStub,
  branchRoutes,
  collectBranchFlows,
} from "../../src/index.js";

type Home = Checkpoint<"Home">;

// Real Blocks, built through the real factories - what a compliant chain looks like.
const NavHome = defineNavBlock({
  name: "nav-home",
  checkpoint: checkpoint("Home"),
  url: "https://app.example.com/home",
});
const AssertHome = defineExpectBlock({
  name: "assert-home",
  checkpoint: checkpoint("Home"),
  verify: [],
});
const ClearThing = defineMethodBlock({
  name: "clear-thing",
  from: checkpoint("Home"),
  to: checkpoint("Home"),
  instruction: {
    async act() { },
    resolve: () => checkpoint("Home"),
  },
});
const NavExternal = defineNavBlock({
  name: "nav-mailpit",
  checkpoint: checkpoint("Mailpit"),
  url: "https://mail.example.net/inbox",
});

// A hand-rolled fake - structurally a Block, but never went through a real
// waygraph factory, so it carries none of the __waygraphKind/__waygraphSalt
// runtime markers. This is exactly the "agent hacks the blocks" shape the
// map() builder exists to reject.
const fakeBlock = {
  name: "sneaky-fake",
  instruction: {
    async act() {},
    resolve: () => checkpoint("Home"),
  },
} as unknown as ReturnType<typeof defineNavBlock<Home>>;

const fakeContext = {
  newPage: async () => ({ close: async () => {}, goto: async () => {} }),
} as any;

// A real two-outcome Block (Decision = Home | Away): observe() reads what act() wrote, resolve()
// picks the tag from it - the actual shape .branch() has to dispatch on, not a hand-fixed Out.
const { whichWay: WhichWay } = keys("test")<{ whichWay: "home" | "away" }>();
const Decide = defineMethodBlock({
  name: "decide",
  from: checkpoint("Home"),
  to: [checkpoint("Home"), checkpoint("Away")],
  instruction: {
    async act() { },
    observe: async (_page, mem) => mem.get(WhichWay),
    resolve: (which) => (which === "away" ? checkpoint("Away") : checkpoint("Home")),
  },
});
const AwayBlock = defineMethodBlock({
  name: "away-block",
  from: checkpoint("Away"),
  to: checkpoint("Home"),
  instruction: { async act() { }, resolve: () => checkpoint("Home") },
});

test.describe("Engine.map() builder", () => {
  test("a chain of real Blocks (nav -> assert -> method) builds and runs a real Flow", async () => {
    const engine = new Engine();
    const flow = engine.map().gotoPage(NavHome, { expect: [AssertHome] }).method(ClearThing);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("gotoPage() rejects a hand-rolled object with no waygraph kind marker", () => {
    const engine = new Engine();
    expect(() => engine.map().gotoPage(fakeBlock)).toThrow(
      /gotoPage\("sneaky-fake"\).*defineNavBlock.*no waygraph kind marker/s,
    );
  });

  test("method() rejects an Expect Block at runtime when cast past the brand (it goes in expect: [...])", () => {
    const engine = new Engine();
    expect(() =>
      engine.map().gotoPage(NavHome).method(AssertHome as unknown as typeof ClearThing),
    ).toThrow(/method\("assert-home"\) got an Expect Block.*expect: \[\.\.\.\]/s);
  });

  test("method() rejects a hand-rolled object with no waygraph salt marker at all", () => {
    const engine = new Engine();
    expect(() =>
      engine.map().gotoPage(NavHome).method(fakeBlock as unknown as typeof ClearThing),
    ).toThrow(
      /method\("sneaky-fake"\).*defineMethodBlock.*no waygraph salt marker/s,
    );
  });

  test("gotoPage() throws when the Block's static url is actually cross-origin", () => {
    const engine = new Engine();
    expect(() =>
      engine.map({ homeOrigin: "https://app.example.com" }).gotoPage(NavExternal),
    ).toThrow(/gotoPage\("nav-mailpit"\).*NOT this map's home origin.*gotoExternal/s);
  });

  test("gotoExternal() throws when the Block's static url is actually same-origin", () => {
    const engine = new Engine();
    expect(() =>
      engine.map({ homeOrigin: "https://app.example.com" }).gotoExternal(NavHome),
    ).toThrow(/gotoExternal\("nav-home"\).*IS this map's home origin.*gotoPage/s);
  });

  test("origin check is skipped (not an error) when homeOrigin isn't configured", async () => {
    const engine = new Engine();
    // No homeOrigin given - gotoExternal on an actually-internal Block is allowed, undecidable by design.
    const flow = engine.map().gotoExternal(NavHome);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("a map() with zero steps lists no Blocks, and fails when it's run", async () => {
    const engine = new Engine();
    expect(engine.map().blocks()).toEqual([]);
    await expect(engine.map().run(new MemPage())).rejects.toThrow(/zero steps/);
  });

  test("ffStart/ffEnd collapses inners into one fastForwardCompose step", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .ffStart("ff-auth")
      .gotoPage(NavHome)
      .method(ClearThing)
      .ffEnd();
    const blocks = flow.blocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("ff-auth");
    expect((blocks[0]!.block as { fastForward?: boolean }).fastForward).toBe(true);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("ffEnd without ffStart throws; a flow used with an ffStart still open throws", () => {
    const engine = new Engine();
    expect(() => engine.map().ffEnd()).toThrow(/no open/);
    expect(() => engine.map().ffStart("x").gotoPage(NavHome).blocks()).toThrow(/still open/);
  });

  test("{ ff: true } fast-forwards a step inline, no ffStart/ffEnd bracket - PIA ask", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .gotoPage(NavHome, { ff: true })
      .method(ClearThing, { ff: true });
    const blocks = flow.blocks();
    expect(blocks).toHaveLength(1);
    expect((blocks[0]!.block as { fastForward?: boolean }).fastForward).toBe(true);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("{ ff: true } steps merge into ONE fast-forward block, but a plain step after them is not swept in", () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .gotoPage(NavHome, { ff: true })
      .method(ClearThing, { ff: true })
      .method(ClearThing);
    const blocks = flow.blocks();
    expect(blocks).toHaveLength(2);
    expect((blocks[0]!.block as { fastForward?: boolean }).fastForward).toBe(true);
    expect((blocks[1]!.block as { fastForward?: boolean }).fastForward).toBeUndefined();
  });

  test("an auto-opened { ff: true } window left open at the flow's end closes silently - no 'still open' error, unlike an explicit .ffStart()", () => {
    const engine = new Engine();
    expect(() =>
      engine.map().gotoPage(NavHome, { ff: true }).blocks(),
    ).not.toThrow();
  });

  test("Block.stubBefore chains ctx and keeps map() kind markers", async () => {
    const { runStubPhase } = await import("../../src/index.js");
    const decorated = ClearThing.stubBefore((ctx) => {
      ctx.ui.ring("x", { selector: "#x", label: "from decorate", tone: "info" });
    });
    expect((decorated as { __waygraphSalt?: string }).__waygraphSalt).toBe("method");
    const phase = await runStubPhase(decorated, "stubBefore", { mem: new MemPage() });
    expect(phase.highlights.some((h) => h.label?.includes("from decorate"))).toBe(true);
    const engine = new Engine();
    const flow = engine.map().gotoPage(NavHome).method(decorated);
    const mem = new MemPage();
    expect(await flow.run(fakeContext, mem)).toEqual(checkpoint("Home"));
  });

  test("the standalone map() export is equivalent to new Engine().map()", async () => {
    const { map } = await import("../../src/index.js");
    const flow = map().gotoPage(NavHome);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("branch() continues into the matching route's Flow, same page - real regression: connect() drops .next entirely, so branching only ever worked through a raw runGraph() call, never a Map-built Flow", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(AwayBlock) });
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("branch()'s route function is handed a MapBuilder seeded at the branch's OWN Checkpoint, not the special start S - a route Block whose In is that Checkpoint (not S) typechecks and runs", async () => {
    // Real bug this guards: an earlier version took ready-made Flow<any> route values, but a
    // fresh Flow always starts at S - AwayBlock's In is Away, not S, so `engine.map().method(AwayBlock)`
    // (what a Flow route would have had to build) never typechecks. Only tsx's unchecked execution
    // hid this - `tsc --noEmit` on the equivalent flow file caught it for real.
    //
    // What this does NOT prove (a real limit, not this test's job): the branch's first Block still
    // sees `input.__state === "__start__"` in act(), not the real resolved tag - runGraph seeds
    // every Flow's entry Block that way unconditionally (see engine/run/run.ts), same as any flow
    // that starts mid-chain. Real Blocks read
    // page/mem, never `input`, for exactly this reason - `routeAware` here reads `page`, not input.
    const engine = new Engine();
    let ranOnAway = false;
    const routeAware = defineMethodBlock({
      name: "route-aware",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        instruction: {
        async act() {
          ranOnAway = true;
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(routeAware) });
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    const result = await flow.run(fakeContext, mem);
    expect(ranOnAway).toBe(true);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("branch() takes the null (terminal) route without running the other branch's Flow at all", async () => {
    const engine = new Engine();
    let awayRan = false;
    const spiedAway = defineMethodBlock({
      name: "away-block",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        instruction: {
        async act() {
          awayRan = true;
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(spiedAway) });
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
    expect(awayRan).toBe(false);
  });

  test("branch() with the same page across the branch: the SAME Page object is handed to the branch's Flow, not a fresh one", async () => {
    const engine = new Engine();
    const seenPages: unknown[] = [];
    const spiedAway = defineMethodBlock({
      name: "away-block",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        instruction: {
        async act(page) {
          seenPages.push(page);
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(spiedAway) });
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    const page = { close: async () => {}, goto: async () => {} };
    const context = { newPage: async () => page } as any;
    await flow.run(context, mem, { page: page as any });
    expect(seenPages).toEqual([page]);
  });

  test("branch() rejects the mem-only run(mem, config) convenience form with a clear error, not a silent state loss", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(AwayBlock) });
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    await expect((flow.run as any)(mem, {})).rejects.toThrow(/run\(context, mem/);
  });

  test("branch()'s output still supports withBlockVerify (patches the prefix, rebuilds the same branched shape)", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: null, Away: (m) => m.method(AwayBlock) })
      .withBlockVerify("decide", []);
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("a route can itself end in another .branch() - a real 2-level tree, both levels actually dispatch independently", async () => {
    const engine = new Engine();
    const { subWhichWay: SubWhichWay } = keys("test")<{ subWhichWay: "near" | "far" }>();
    let ranAwayHome = false;
    let ranFar = false;
    const SubDecide = defineMethodBlock({
      name: "sub-decide",
        from: checkpoint("Away"),
        to: [checkpoint("Home"), checkpoint("Away")],
        instruction: {
        async act() {},
        observe: async (_page, mem) => mem.get(SubWhichWay),
        resolve: (which) => (which === "far" ? checkpoint("Away") : checkpoint("Home")),
      },
    });
    const FarBlock = defineMethodBlock({
      name: "far-block",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        instruction: {
        async act() {
          ranFar = true;
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const NearBlock = defineMethodBlock({
      name: "near-block",
        from: checkpoint("Home"),
        to: checkpoint("Home"),
        instruction: {
        async act() {
          ranAwayHome = true;
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: null,
        // First dispatch reads WhichWay ("away") to get here; the second, independent dispatch
        // reads a DIFFERENT mem key (SubWhichWay, "near") - proving this is a real second decision
        // with its own condition, not the first branch's route reused.
        Away: (m) =>
          m.method(SubDecide).branch({
            Home: (m2) => m2.method(NearBlock),
            Away: (m2) => m2.method(FarBlock),
          }),
      });
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    mem.set(SubWhichWay, "near");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
    expect(ranAwayHome).toBe(true);
    expect(ranFar).toBe(false);
  });

  test(".blocks() static introspection recurses into nested branches too - every block across every level is listed, tag-prefixed", () => {
    const engine = new Engine();
    const SubDecide = defineMethodBlock({
      name: "sub-decide",
        from: checkpoint("Away"),
        to: [checkpoint("Home"), checkpoint("Away")],
        instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const FarBlock = defineMethodBlock({
      name: "far-block",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const NearBlock = defineMethodBlock({
      name: "near-block",
        from: checkpoint("Home"),
        to: checkpoint("Home"),
        instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: null,
        Away: (m) =>
          m.method(SubDecide).branch({
            Home: (m2) => m2.method(NearBlock),
            Away: (m2) => m2.method(FarBlock),
          }),
      });
    const names = flow.blocks().map((b) => b.name);
    expect(names).toEqual([
      "nav-home",
      "decide",
      "Away -> sub-decide",
      "Away -> Home -> near-block",
      "Away -> Away -> far-block",
    ]);
  });

  test("seedMemStub() fills requires for EVERY block across EVERY branch (and nested branch), not only whichever path a live run would take - regression coverage: a required key missing on an unreached branch still fails preflight", () => {
    const engine = new Engine();
    const { wantsSecret: WantsSecret } = keys("test")<{ wantsSecret: string }>();
    const NeedsSecret = defineMethodBlock({
      name: "needs-secret",
        from: checkpoint("Away"),
        to: checkpoint("Home"),
        requires: [WantsSecret],
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: null,
        // Only the Away leg needs this key - a live run with WhichWay="home" would never touch it.
        Away: (m) => m.method(NeedsSecret),
      });
    // Unregistered: seedMemStub leaves it unset (matches withMemStub's own preflight-fails-loud contract).
    const mem1 = new MemPage();
    mem1.set(WhichWay, "home");
    seedMemStub(mem1, flow);
    expect(mem1.has(WantsSecret)).toBe(false);

    registerMemStub(WantsSecret, () => "fake-secret");
    const mem2 = new MemPage();
    mem2.set(WhichWay, "home"); // still the branch that would NEVER reach needs-secret live
    seedMemStub(mem2, flow);
    expect(mem2.get(WantsSecret)).toBe("fake-secret");
  });

  test("branchRoutes()/collectBranchFlows() expose the branch tree statically, without running anything - see branch-regression.spec.ts for runBranchRegression() itself", () => {
    const engine = new Engine();
    const NearBlock = defineMethodBlock({
      name: "near-block",
        from: checkpoint("Home"),
        to: checkpoint("Home"),
        instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: (m) => m.method(NearBlock),
        Away: (m) => m.gotoPage(NavHome),
      });

    const routes = branchRoutes(flow);
    expect([...routes!.keys()].sort()).toEqual(["Away", "Home"]);

    const entries = collectBranchFlows(flow);
    expect(entries.map((e) => e.path).sort()).toEqual(["Away", "Home"]);
  });
});
