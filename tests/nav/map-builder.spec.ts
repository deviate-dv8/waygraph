import { test, expect } from "@playwright/test";
import type { Checkpoint, AssertBlock } from "../../src/index.js";
import {
  Engine,
  MemPage,
  checkpoint,
  defineNavBlock,
  defineAssertBlock,
  defineMethodBlock,
} from "../../src/index.js";

type Home = Checkpoint<"Home">;
type Cleared = Checkpoint<"Home">;

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
});
