import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/types.js";
import { connect, checkpoint } from "../src/types.js";
import { MemPage } from "../src/mem-page.js";

// A stand-in for Playwright's Page in tests that never touch the real browser -
// these Blocks only exercise act/observe/resolve wiring, not real page interaction.
const fakePage = {} as import("@playwright/test").Page;

type Start = Checkpoint<"__start__">;
type LoggedOut = Checkpoint<"LoggedOut">;
type Authed = Checkpoint<"Authed">;

test.describe("Block + connect()", () => {
  test("a Block with only act + resolve (no observe) still produces a valid output", async () => {
    const registerBlock: Block<Start, LoggedOut> = {
      name: "register",
      instruction: {
        async act() {
          /* no-op for this test */
        },
        resolve: () => checkpoint("LoggedOut"),
      },
    };

    const mem = new MemPage();
    await registerBlock.instruction.act(fakePage, checkpoint("__start__"), mem);
    const out = await registerBlock.instruction.resolve(undefined);

    expect(out).toEqual(checkpoint("LoggedOut"));
  });

  test("connect() runs A's full instruction then B's act, and yields B's output", async () => {
    const calls: string[] = [];

    const registerBlock: Block<Start, LoggedOut> = {
      name: "register",
      instruction: {
        async act() {
          calls.push("register.act");
        },
        resolve: () => {
          calls.push("register.resolve");
          return checkpoint("LoggedOut");
        },
      },
    };

    const loginBlock: Block<LoggedOut, Authed> = {
      name: "login",
      instruction: {
        async act(_page, input) {
          calls.push(`login.act(${input.__state})`);
        },
        resolve: () => {
          calls.push("login.resolve");
          return checkpoint("Authed");
        },
      },
    };

    const chain = connect(registerBlock, loginBlock);
    const mem = new MemPage();

    await chain.instruction.act(fakePage, checkpoint("__start__"), mem);
    const observed = chain.instruction.observe
      ? await chain.instruction.observe(fakePage, mem)
      : undefined;
    const out = await chain.instruction.resolve(observed);

    expect(out).toEqual(checkpoint("Authed"));
    expect(calls).toEqual([
      "register.act",
      "register.resolve",
      "login.act(LoggedOut)",
      "login.resolve",
    ]);
  });

  test("connect() carries B's observe through when B declares one", async () => {
    const registerBlock: Block<Start, LoggedOut> = {
      name: "register",
      instruction: {
        async act() {},
        resolve: () => checkpoint("LoggedOut"),
      },
    };

    const loginBlock: Block<LoggedOut, Authed> = {
      name: "login",
      instruction: {
        async act() {},
        async observe() {
          return "url-changed" as const;
        },
        resolve: (signal) => checkpoint(signal === "url-changed" ? "Authed" : "Authed"),
      },
    };

    const chain = connect(registerBlock, loginBlock);
    expect(chain.instruction.observe).toBeDefined();

    const mem = new MemPage();
    await chain.instruction.act(fakePage, checkpoint("__start__"), mem);
    const observed = await chain.instruction.observe!(fakePage, mem);
    expect(observed).toBe("url-changed");
  });
});
