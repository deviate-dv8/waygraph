import { test, expect } from "@playwright/test";
import type { Checkpoint } from "../../src/index.js";
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

  test("assert() rejects a real Block of the wrong kind (a NavBlock, not an AssertBlock)", () => {
    // NavBlock's own In is the generic Checkpoint<string> (works from any
    // state), so this still typechecks against .assert()'s Block<Out,
    // NextOut> parameter - only the runtime __waygraphKind marker check
    // catches it, which is exactly the point: the type system alone can't
    // tell a Nav step from an Assert step, only the factory-set marker can.
    const engine = new Engine();
    expect(() => engine.map().start().assert(NavHome)).toThrow(
      /assert\("nav-home"\).*defineAssertBlock.*kind "nav"/s,
    );
  });

  test("method() accepts a real AssertBlock too - defineAssertBlock is built on defineMethodBlock internally, so it already carries the same __waygraphSalt", async () => {
    const engine = new Engine();
    const flow = engine.map().start().gotoPage(NavHome).method(AssertHome).end();
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });

  test("method() rejects a hand-rolled object with no waygraph salt marker at all", () => {
    const engine = new Engine();
    expect(() => engine.map().start().gotoPage(NavHome).method(fakeBlock)).toThrow(
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

  test("the standalone map() export is equivalent to new Engine().map()", async () => {
    const { map } = await import("../../src/index.js");
    const flow = map().gotoPage(NavHome).end();
    const mem = new MemPage();
    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("Home"));
  });
});
