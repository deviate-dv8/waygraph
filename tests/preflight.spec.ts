import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { connect, runGraph, preflight, MemPage, key, checkpoint } from "../src/index.js";

type Start = Checkpoint<"__start__">;
type LoggedIn = Checkpoint<"LoggedIn">;
type Done = Checkpoint<"Done">;

const UsernameKey = key<string>("username");
const PasswordKey = key<string>("password");

test.describe("preflight", () => {
  test("throws naming every missing key, without ever opening a tab", async () => {
    let openedTab = false;
    const contextThatShouldNeverBeUsed = {
      newPage: async () => {
        openedTab = true;
        throw new Error("should never be called");
      },
    } as any;

    const login: Block<Start, LoggedIn> = {
      name: "login",
      instruction: {
        async act(page, _input, mem) {
          await page.goto("/"); // never reached
          void mem.get(UsernameKey);
        },
        resolve: () => checkpoint("LoggedIn"),
      },
      requires: [UsernameKey, PasswordKey],
    };

    const mem = new MemPage(); // neither key set

    await expect(
      runGraph<LoggedIn>(login, undefined, contextThatShouldNeverBeUsed, mem),
    ).rejects.toThrow(/"username".*"password"|"password".*"username"/);

    expect(openedTab).toBe(false);
  });

  test("passes silently once every required key is set", async () => {
    const fakePage = { close: async () => {} } as any;
    const fakeContext = { newPage: async () => fakePage } as any;

    const login: Block<Start, LoggedIn> = {
      name: "login",
      instruction: { async act() {}, resolve: () => checkpoint("LoggedIn") },
      requires: [UsernameKey, PasswordKey],
    };

    const mem = new MemPage();
    mem.setAll([UsernameKey, "alice"], [PasswordKey, "hunter2"]);

    const result = await runGraph<LoggedIn>(login, undefined, fakeContext, mem);
    expect(result).toEqual(checkpoint("LoggedIn"));
  });

  test("connect() unions requires from both Blocks into the composed Block", () => {
    const a: Block<Start, LoggedIn> = {
      name: "a",
      instruction: { async act() {}, resolve: () => checkpoint("LoggedIn") },
      requires: [UsernameKey],
    };
    const b: Block<LoggedIn, Done> = {
      name: "b",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
      requires: [PasswordKey],
    };

    const chain = connect(a, b);

    expect(chain.requires).toEqual([UsernameKey, PasswordKey]);
  });

  test("preflight() called directly reports missing keys without running anything", () => {
    const needsBoth: Block<Start, LoggedIn> = {
      name: "needs-both",
      instruction: { async act() {}, resolve: () => checkpoint("LoggedIn") },
      requires: [UsernameKey, PasswordKey],
    };

    const mem = new MemPage();
    mem.set(UsernameKey, "alice"); // PasswordKey still missing

    expect(() => preflight(mem, needsBoth)).toThrow(/"password"/);
    expect(() => preflight(mem, needsBoth)).not.toThrow(/"username"/);
  });
});
