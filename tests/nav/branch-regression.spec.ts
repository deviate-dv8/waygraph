import { test, expect } from "@playwright/test";
import type { Checkpoint } from "../../src/index.js";
import {
  Engine,
  MemPage,
  checkpoint,
  key,
  defineNavBlock,
  defineMethodBlock,
  runBranchRegression,
  branchRoutes,
  withSessionReset,
  withTitle,
} from "../../src/index.js";

type Home = Checkpoint<"Home">;
type Away = Checkpoint<"Away">;

const NavHome = defineNavBlock<Home>({
  name: "nav-home",
  checkpoint: "Home",
  url: "https://app.example.com/home",
});
const WhichWay = key<"home" | "away">("which-way");
const Decide = defineMethodBlock<Home, Home | Away>({
  name: "decide",
  instruction: {
    async act() {},
    observe: async (_page, mem) => mem.get(WhichWay),
    resolve: (which) => (which === "away" ? checkpoint("Away") : checkpoint("Home")),
  },
});

/**
 * A minimal fake Browser/BrowserContext/Page - enough surface for runBranchRegression's own
 * orchestration (newContext(storageState), storageState(), newPage/goto/close/url) without a real
 * browser process. Records every call so the tests below assert on the ACTUAL cloning mechanics
 * (how many contexts got created, with what storageState, navigated to what URL) - this is testing
 * waygraph's own orchestration, not Playwright's storageState persistence, which is Playwright's.
 */
function fakeBrowser() {
  const newContextCalls: unknown[] = [];
  let nextId = 0;
  function makePage(id: number) {
    let url = "about:blank";
    return {
      id,
      url: () => url,
      goto: async (u: string) => {
        url = u;
      },
      close: async () => {},
    };
  }
  function makeContext(id: number, seenFrom?: unknown) {
    return {
      id,
      seenFrom,
      newPage: async () => makePage(++nextId),
      storageState: async () => ({ cookies: [], origins: [], from: id }),
      browser: () => browser,
      close: async () => {},
    };
  }
  const contexts: ReturnType<typeof makeContext>[] = [];
  const browser = {
    newContext: async (opts?: { storageState?: unknown }) => {
      newContextCalls.push(opts?.storageState);
      const ctx = makeContext(++nextId, opts?.storageState);
      contexts.push(ctx);
      return ctx;
    },
  };
  const root = makeContext(0);
  contexts.push(root);
  return { browser, root, contexts, newContextCalls };
}

test.describe("runBranchRegression", () => {
  test("default cloneSession: explores BOTH branches (not just whichever the live dispatch would take), each from a real storageState clone of the prefix's own session", async () => {
    const engine = new Engine();
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const AwayBlock = defineMethodBlock<Away, Home>({
      name: "away-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: (m) => m.method(NearBlock).end(),
        Away: (m) => m.method(AwayBlock).end(),
      });

    const { browser, root, newContextCalls } = fakeBrowser();
    const mem = new MemPage();
    mem.set(WhichWay, "home"); // a live run would only ever take THIS path
    const results = await runBranchRegression(flow, root as never, mem);

    const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
    expect(byPath.Home).toMatchObject({ status: "ok", result: { __state: "Home" } });
    // Away ran too, even though WhichWay="home" would never reach it live - the whole point.
    expect(byPath.Away).toMatchObject({ status: "ok", result: { __state: "Home" } });
    // Each branch got its own fresh browser context, seeded from the SAME captured storageState.
    expect(newContextCalls.length).toBe(2);
    expect(newContextCalls[0]).toEqual(newContextCalls[1]);
    void browser;
  });

  test("cloneSession: false runs the single live path only (no newContext calls) - can't explore the sibling once the one real page has moved past it", async () => {
    const engine = new Engine();
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const AwayBlock = defineMethodBlock<Away, Home>({
      name: "away-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: (m) => m.method(NearBlock).end(),
        Away: (m) => m.method(AwayBlock).end(),
      });

    const { root, newContextCalls } = fakeBrowser();
    const mem = new MemPage();
    mem.set(WhichWay, "away");
    const results = await runBranchRegression(flow, root as never, mem, { cloneSession: false });

    expect(results).toEqual([{ path: "Away", status: "ok", result: { __state: "Home" } }]);
    expect(newContextCalls.length).toBe(0);
  });

  test("each cloned branch gets an ISOLATED MemPage clone - a write inside one branch never leaks into a sibling or the caller's own mem", async () => {
    const engine = new Engine();
    const Marker = key<string>("marker");
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
      instruction: {
        async act(_page, _input, mem) {
          mem.set(Marker, "near");
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const AwayBlock = defineMethodBlock<Away, Home>({
      name: "away-block",
      instruction: {
        async act(_page, _input, mem) {
          mem.set(Marker, "away");
        },
        resolve: () => checkpoint("Home"),
      },
    });
    const flow = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({
        Home: (m) => m.method(NearBlock).end(),
        Away: (m) => m.method(AwayBlock).end(),
      });

    const { root } = fakeBrowser();
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    await runBranchRegression(flow, root as never, mem);

    // The caller's own mem was never written by either branch's clone.
    expect(mem.has(Marker)).toBe(false);
  });

  test("a nested branch is reachable too - runBranchRegression walks the whole tree, not just one level", async () => {
    const engine = new Engine();
    const SubWhichWay = key<"near" | "far">("sub-which-way");
    const SubDecide = defineMethodBlock<Away, Home | Away>({
      name: "sub-decide",
      instruction: {
        async act() {},
        observe: async (_page, mem) => mem.get(SubWhichWay),
        resolve: (which) => (which === "far" ? checkpoint("Away") : checkpoint("Home")),
      },
    });
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const FarBlock = defineMethodBlock<Away, Home>({
      name: "far-block",
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

    const { root } = fakeBrowser();
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    mem.set(SubWhichWay, "near");
    const results = await runBranchRegression(flow, root as never, mem);
    const paths = results.map((r) => r.path).sort();
    expect(paths).toEqual(["Away > Away", "Away > Home", "Home"]);
  });

  test("with* wrappers (withSessionReset/withTitle) on a Map-built branched Flow keep it branchable - map already supports session reset, and the branch tree survives the wrapper's spread", async () => {
    const engine = new Engine();
    const NearBlock = defineMethodBlock<Home, Home>({
      name: "near-block",
      instruction: { async act() {}, resolve: () => checkpoint("Home") },
    });
    const branched = engine
      .map()
      .gotoPage(NavHome)
      .method(Decide)
      .branch({ Home: (m) => m.method(NearBlock).end(), Away: null });
    const wrapped = withTitle(withSessionReset(branched), "Sign in");
    expect(wrapped.resetSession).toBe(true);
    expect(wrapped.title).toBe("Sign in");
    expect([...branchRoutes(wrapped)!.keys()].sort()).toEqual(["Away", "Home"]);

    const { root } = fakeBrowser();
    const mem = new MemPage();
    mem.set(WhichWay, "home");
    const results = await runBranchRegression(wrapped, root as never, mem);
    expect(results.map((r) => r.path).sort()).toEqual(["Away", "Home"]);
  });
});
