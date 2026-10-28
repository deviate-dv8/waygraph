import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import {
  Engine,
  MemPage,
  checkpoint,
  registerMemStub,
  seedMemStub,
  preflight,
  keys,
  MemKey,
} from "../../src/index.js";
import { buildFlow, withSettings } from "../../src/engine/flow/flow.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;

test.describe("memStub", () => {
  test("seedMemStub fills a required key from its registered generator", async () => {
    const MemStubTestKeys = keys("mem-stub-test")<{
      username: string;
    }>();
    registerMemStub(MemStubTestKeys.username, () => "fake-user");

    const block: Block<Start, A> = {
      name: "needs-username",
      requires: [MemStubTestKeys.username],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const engine = new Engine();
    const flow = withSettings(buildFlow([block], engine.config), { memStub: true });

    const mem = new MemPage();
    seedMemStub(mem, flow);
    expect(mem.get(MemStubTestKeys.username)).toBe("fake-user");

    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("A"));
  });

  test("seedMemStub does not overwrite a key that's already set", async () => {
    const MemStubTestKeys = keys("mem-stub-test")<{
      password: string;
    }>();
    registerMemStub(MemStubTestKeys.password, () => "fake-password");

    const block: Block<Start, A> = {
      name: "needs-password",
      requires: [MemStubTestKeys.password],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withSettings(buildFlow([block], new Engine().config), { memStub: true });

    const mem = new MemPage();
    mem.set(MemStubTestKeys.password, "real-password");
    seedMemStub(mem, flow);
    expect(mem.get(MemStubTestKeys.password)).toBe("real-password");
  });

  test("an unregistered required key is left unfilled - preflight still catches it", async () => {
    const MemStubTestKeys = keys("mem-stub-test")<{
      unregistered: string;
    }>();
    const block: Block<Start, A> = {
      name: "needs-unregistered",
      requires: [MemStubTestKeys.unregistered],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withSettings(buildFlow([block], new Engine().config), { memStub: true });

    const mem = new MemPage();
    seedMemStub(mem, flow);
    expect(mem.has(MemStubTestKeys.unregistered)).toBe(false);
    expect(() => preflight(mem, block)).toThrow(/mem-stub-test\.unregistered/);
  });

  test("registry is keyed by MemKey identity, not by name - two keys sharing a debug name never cross-contaminate", () => {
    const KeyA = new MemKey<string>("mem-stub-test.shared-name");
    const KeyB = new MemKey<string>("mem-stub-test.shared-name");
    registerMemStub(KeyA, () => "value-for-a");

    const mem = new MemPage();
    const blockUsingB: Block<Start, A> = {
      name: "needs-b",
      requires: [KeyB],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withSettings(buildFlow([blockUsingB], new Engine().config), { memStub: true });
    seedMemStub(mem, flow);

    // KeyB has no registration of its own - KeyA's registration (same debug
    // name, different identity) must not leak onto it.
    expect(mem.has(KeyB)).toBe(false);
  });

  test("withMemStub's memStub flag survives withBlockVerify/modBlockVerify", () => {
    const block: Block<Start, A> = {
      name: "b",
      instruction: {
        async act() {},
        resolve: () => checkpoint("A"),
        verify: [{ name: "x", check: async () => true }],
      },
    };
    const flow = withSettings(buildFlow([block], new Engine().config), { memStub: true });
    expect(flow.memStub).toBe(true);

    const patched = flow.withBlockVerify(block, [{ name: "y", check: async () => true }]);
    expect(patched.memStub).toBe(true);

    const modded = flow.modBlockVerify("b", 0, { name: "z", check: async () => true });
    expect(modded.memStub).toBe(true);
  });

  test("a flow not wrapped in withMemStub has memStub undefined", () => {
    const block: Block<Start, A> = {
      name: "b",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = buildFlow([block], new Engine().config);
    expect(flow.memStub).toBeUndefined();
  });
});
