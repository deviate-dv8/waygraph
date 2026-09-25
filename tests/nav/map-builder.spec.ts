import { test, expect } from "@playwright/test";
import type { Checkpoint, AssertBlock } from "../../src/index.js";
import {
  Engine,
  MemPage,
  checkpoint,
  key,
  defineNavBlock,
  defineAssertBlock,
  defineMethodBlock,
} from "../../src/index.js";

type Home = Checkpoint<"Home">;
type Cleared = Checkpoint<"Home">;
type Away = Checkpoint<"Away">;

// Real Blocks, built through the real factories - what a compliant chain looks like.
const NavHome = defineNavBlock<Home>({
  name: "nav-home",
  checkpoint: "Home",
  url: "https://app.example.com/home",
});
const AssertHome = defineAssertBlock<Home>({
  name: "assert-home",
  checkpoint: "Home",
  verify: [],
});
const ClearThing = defineMethodBlock<Home, Cleared>({
  name: "clear-thing",
  instruction: {
    async act() {},
    resolve: () => checkpoint("Home"),
  },
});
const NavExternal = defineNavBlock<Checkpoint<"Mailpit">>({
  name: "nav-mailpit",
  checkpoint: "Mailpit",
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
const WhichWay = key<"home" | "away">("which-way");
const Decide = defineMethodBlock<Home, Home | Away>({
  name: "decide",
  instruction: {
    async act() {},
    observe: async (_page, mem) => mem.get(WhichWay),
    resolve: (which) => (which === "away" ? checkpoint("Away") : checkpoint("Home")),
  },
});
const AwayBlock = defineMethodBlock<Away, Home>({
  name: "away-block",
  instruction: { async act() {}, resolve: () => checkpoint("Home") },
});

test.describe("Engine.map() builder", () => {
  test("a chain of real Blocks (nav -> assert -> method) builds and runs a real Flow", async () => {
    const engine = new Engine();
    const flow = engine.map().start().gotoPage(NavHome).assert(AssertHome).method(ClearThing).end();
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("gotoPage() rejects a hand-rolled object with no waygraph kind marker", () => {
    const engine = new Engine();
    expect(() => engine.map().start().gotoPage(fakeBlock)).toThrow(
      /gotoPage\("sneaky-fake"\).*defineNavBlock.*no waygraph kind marker/s,
    );
  });

  test("assert() rejects a real Block of the wrong kind at runtime (cast past the brand)", () => {
    // Compile-time brands already reject Nav in .assert(); this cast proves the
    // runtime __waygraphKind marker still fails loud if something bypasses TS.
    const engine = new Engine();
    expect(() =>
      engine.map().start().assert(NavHome as unknown as AssertBlock<Checkpoint<"__start__">>),
    ).toThrow(
      /assert\("nav-home"\).*defineAssertBlock.*kind "nav"/s,
    );
  });

  test("method() rejects AssertBlock at runtime when cast past the brand (use .assert())", () => {
    const engine = new Engine();
    expect(() =>
      engine.map().start().gotoPage(NavHome).method(AssertHome as unknown as typeof ClearThing),
    ).toThrow(/method\("assert-home"\).*defineAssertBlock.*\.assert\(\)/s);
  });

  test("method() rejects a hand-rolled object with no waygraph salt marker at all", () => {
    const engine = new Engine();
    expect(() =>
      engine.map().start().gotoPage(NavHome).method(fakeBlock as unknown as typeof ClearThing),
    ).toThrow(
      /method\("sneaky-fake"\).*defineMethodBlock.*no waygraph salt marker/s,
    );
  });

  test("gotoPage() throws when the Block's static url is actually cross-origin", () => {
    const engine = new Engine();
    expect(() =>
      engine.map({ homeOrigin: "https://app.example.com" }).start().gotoPage(NavExternal),
    ).toThrow(/gotoPage\("nav-mailpit"\).*NOT this map's home origin.*gotoExternal/s);
  });

  test("gotoExternal() throws when the Block's static url is actually same-origin", () => {
    const engine = new Engine();
    expect(() =>
      engine.map({ homeOrigin: "https://app.example.com" }).start().gotoExternal(NavHome),
    ).toThrow(/gotoExternal\("nav-home"\).*IS this map's home origin.*gotoPage/s);
  });

  test("origin check is skipped (not an error) when homeOrigin isn't configured", async () => {
    const engine = new Engine();
    // No homeOrigin given - gotoExternal on an actually-internal Block is allowed, undecidable by design.
    const flow = engine.map().start().gotoExternal(NavHome).end();
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("end() throws when called with zero steps", () => {
    const engine = new Engine();
    expect(() => engine.map().start().end()).toThrow(/zero steps/);
  });

  test("ffStart/ffEnd collapses inners into one fastForwardCompose step", async () => {
    const engine = new Engine();
    const flow = engine
      .map()
      .start()
      .ffStart("ff-auth")
      .gotoPage(NavHome)
      .method(ClearThing)
      .ffEnd()
      .end();
    const blocks = flow.blocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.name).toBe("ff-auth");
    expect((blocks[0]!.block as { fastForward?: boolean }).fastForward).toBe(true);
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("ffEnd without ffStart / end while ff open throw", () => {
    const engine = new Engine();
    expect(() => engine.map().start().ffEnd()).toThrow(/no open/);
    expect(() => engine.map().start().ffStart("x").end()).toThrow(/still open/);
  });

  test("Block.stubBefore chains ctx and keeps map() kind markers", async () => {
    const { runStubPhase } = await import("../../src/index.js");
    const decorated = ClearThing.stubBefore((ctx) => {
      ctx.ring("x", { selector: "#x", label: "from decorate", tone: "info" });
    });
    expect((decorated as { __waygraphSalt?: string }).__waygraphSalt).toBe("method");
    const phase = await runStubPhase(decorated, "stubBefore", { mem: new MemPage() });
    expect(phase.highlights.some((h) => h.label?.includes("from decorate"))).toBe(true);
    const engine = new Engine();
    const flow = engine.map().start().gotoPage(NavHome).method(decorated).end();
    const mem = new MemPage();
    expect(await flow.run(fakeContext, mem)).toEqual(checkpoint("Home"));
  });

  test("the standalone map() export is equivalent to new Engine().map()", async () => {
    const { map } = await import("../../src/index.js");
    const flow = map().gotoPage(NavHome).end();
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
      .branch({ Home: null, Away: (m) => m.method(AwayBlock).end() });
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
    // every Flow's entry Block that way unconditionally (see run-graph.ts), same as any standalone
    // `defineFlow([start, SomeMidChainBlock, end])` already behaves today. Real Blocks read
    // page/mem, never `input`, for exactly this reason - `routeAware` here reads `page`, not input.
    const engine = new Engine();
    let ranOnAway = false;
    const routeAware = defineMethodBlock<Away, Home>({
      name: "route-aware",
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
      .branch({ Home: null, Away: (m) => m.method(routeAware).end() });
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    const result = await flow.run(fakeContext, mem);
    expect(ranOnAway).toBe(true);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("branch() takes the null (terminal) route without running the other branch's Flow at all", async () => {
    const engine = new Engine();
    let awayRan = false;
    const spiedAway = defineMethodBlock<Away, Home>({
      name: "away-block",
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
      .branch({ Home: null, Away: (m) => m.method(spiedAway).end() });
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
    expect(awayRan).toBe(false);
  });

  test("branch() with the same page across the branch: the SAME Page object is handed to the branch's Flow, not a fresh one", async () => {
    const engine = new Engine();
    const seenPages: unknown[] = [];
    const spiedAway = defineMethodBlock<Away, Home>({
      name: "away-block",
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
      .branch({ Home: null, Away: (m) => m.method(spiedAway).end() });
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
      .branch({ Home: null, Away: (m) => m.method(AwayBlock).end() });
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
      .branch({ Home: null, Away: (m) => m.method(AwayBlock).end() })
      .withBlockVerify("decide", []);
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("a route can itself end in another .branch() - a real 2-level tree, both levels actually dispatch independently", async () => {
    const engine = new Engine();
    const SubWhichWay = key<"near" | "far">("sub-which-way");
    let ranAwayHome = false;
    let ranFar = false;
    const SubDecide = defineMethodBlock<Away, Home | Away>({
      name: "sub-decide",
      instruction: {
        async act() {},
        observe: async (_page, mem) => mem.get(SubWhichWay),
        resolve: (which) => (which === "far" ? checkpoint("Away") : checkpoint("Home")),
      },
    });
    const FarBlock = defineMethodBlock<Away, Home>({
      name: "far-block",
      instruction: {
        async act() {
          ranFar = true;
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
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
            Home: (m2) => m2.method(NearBlock).end(),
            Away: (m2) => m2.method(FarBlock).end(),
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
    const SubDecide = defineMethodBlock<Away, Home | Away>({
      name: "sub-decide",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const FarBlock = defineMethodBlock<Away, Home>({
      name: "far-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
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
            Home: (m2) => m2.method(NearBlock).end(),
            Away: (m2) => m2.method(FarBlock).end(),
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
});
