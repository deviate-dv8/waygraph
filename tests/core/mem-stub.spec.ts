import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import {
  Engine,
  start,
  end,
  MemPage,
  checkpoint,
  key,
  registerMemStub,
  seedMemStub,
  withMemStub,
  preflight,
} from "../../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;

test.describe("memStub", () => {
  test("seedMemStub fills a required key from its registered generator", async () => {
    const Username = key<string>("mem-stub-test.username");
    registerMemStub(Username, () => "fake-user");

    const block: Block<Start, A> = {
      name: "needs-username",
      requires: [Username],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const engine = new Engine();
    const flow = withMemStub(engine.defineFlow([start, block, end]));

    const mem = new MemPage();
    seedMemStub(mem, flow);
    expect(mem.get(Username)).toBe("fake-user");

    const result = await flow.run(fakeContext, mem);
    expect(result).toEqual(checkpoint("A"));
  });

  test("seedMemStub does not overwrite a key that's already set", async () => {
    const Password = key<string>("mem-stub-test.password");
    registerMemStub(Password, () => "fake-password");

    const block: Block<Start, A> = {
      name: "needs-password",
      requires: [Password],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withMemStub(new Engine().defineFlow([start, block, end]));

    const mem = new MemPage();
    mem.set(Password, "real-password");
    seedMemStub(mem, flow);
    expect(mem.get(Password)).toBe("real-password");
  });

  test("an unregistered required key is left unfilled - preflight still catches it", async () => {
    const Unregistered = key<string>("mem-stub-test.unregistered");
    const block: Block<Start, A> = {
      name: "needs-unregistered",
      requires: [Unregistered],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withMemStub(new Engine().defineFlow([start, block, end]));

    const mem = new MemPage();
    seedMemStub(mem, flow);
    expect(mem.has(Unregistered)).toBe(false);
    expect(() => preflight(mem, block)).toThrow(/mem-stub-test\.unregistered/);
  });

  test("registry is keyed by MemKey identity, not by name - two keys sharing a debug name never cross-contaminate", () => {
    const KeyA = key<string>("mem-stub-test.shared-name");
    const KeyB = key<string>("mem-stub-test.shared-name");
    registerMemStub(KeyA, () => "value-for-a");

    const mem = new MemPage();
    const blockUsingB: Block<Start, A> = {
      name: "needs-b",
      requires: [KeyB],
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };
    const flow = withMemStub(new Engine().defineFlow([start, blockUsingB, end]));
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
    const flow = withMemStub(new Engine().defineFlow([start, block, end]));
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
    const flow = new Engine().defineFlow([start, block, end]);
    expect(flow.memStub).toBeUndefined();
  });
});
