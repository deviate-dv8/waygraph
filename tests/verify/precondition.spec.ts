import { test, expect } from "@playwright/test";
import type { Checkpoint, Block, Trait } from "../../src/index.js";
import { connect, runGraph, MemPage, checkpoint } from "../../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test.describe("precondition", () => {
  test("a passing precondition Trait lets act() run normally", async () => {
    const passing: Trait = { name: "still-there", check: async () => true };
    const entry: Block<Start, Done> = {
      name: "entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        precondition: [passing],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await runGraph<Done>(entry, undefined, fakeContext, mem);

    expect(result).toEqual(checkpoint("Done"));
  });

  test("a failing precondition Trait throws BEFORE act() ever runs", async () => {
    const calls: string[] = [];
    const failing: Trait = { name: "page-changed-out-from-under-us", check: async () => false };
    const entry: Block<Start, Done> = {
      name: "entry-block",
      instruction: {
        async act() {
          calls.push("act");
        },
        resolve: () => checkpoint("Done"),
        precondition: [failing],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;

    await expect(runGraph<Done>(entry, undefined, fakeContext, mem)).rejects.toThrow(
      /page-changed-out-from-under-us.*entry-block/,
    );
    // The whole point: act() never ran at all, not just that it eventually
    // failed inside act() with a confusing "element not found."
    expect(calls).toEqual([]);
  });

  test("connect() checks the next Block's own precondition right before its act - not the previous Block's", async () => {
    const calls: string[] = [];
    const traceTrait: Trait = {
      name: "trace",
      check: async () => {
        calls.push("b.precondition");
        return true;
      },
    };

    type Mid = Checkpoint<"Mid">;
    const a: Block<Start, Mid> = {
      name: "a",
      instruction: {
        async act() {
          calls.push("a.act");
        },
        resolve: () => checkpoint("Mid"),
      },
    };
    const b: Block<Mid, Done> = {
      name: "b",
      instruction: {
        async act() {
          calls.push("b.act");
        },
        resolve: () => checkpoint("Done"),
        precondition: [traceTrait],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;
    await runGraph<Done>(connect(a, b), undefined, fakeContext, mem);

    expect(calls).toEqual(["a.act", "b.precondition", "b.act"]);
  });

  test("precondition as a function picks different checks depending on the incoming tag", async () => {
    type FromLogin = Checkpoint<"FromLogin">;
    type FromCart = Checkpoint<"FromCart">;
    let arrivingFrom: "login" | "cart" = "login";

    const entry: Block<FromLogin | FromCart, Done> = {
      name: "branching-entry",
      instruction: {
        async act() {},
        resolve: () => checkpoint("Done"),
        precondition: (input) =>
          input.__state === "FromLogin"
            ? [{ name: "from-login-check", check: async () => true }]
            : [{ name: "from-cart-check", check: async () => false }],
      },
    };

    const mem = new MemPage();
    const fakeContext = { newPage: async () => fakePage } as any;

    const a: Block<Start, FromLogin> = {
      name: "a-login",
      instruction: { async act() {}, resolve: () => checkpoint("FromLogin") },
    };
    arrivingFrom = "login";
    await expect(
      runGraph<Done>(connect(a, entry), undefined, fakeContext, mem),
    ).resolves.toEqual(checkpoint("Done"));

    const c: Block<Start, FromCart> = {
      name: "a-cart",
      instruction: { async act() {}, resolve: () => checkpoint("FromCart") },
    };
    arrivingFrom = "cart";
    await expect(
      runGraph<Done>(connect(c, entry), undefined, fakeContext, mem),
    ).rejects.toThrow(/from-cart-check/);
    void arrivingFrom;
  });
});
