import { test, expect } from "@playwright/test";
import { writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { discoverGraph, findBlockPath, findBlockPathDetailed } from "../../src/analysis/graph.js";

const STATES_FILE = `
import type { Checkpoint } from "waygraph";

export type LoginPage = Checkpoint<"LoginPage">;
export type LoggedIn = Checkpoint<"LoggedIn">;
export type CartPage = Checkpoint<"CartPage">;

// A branching action Block's real Out - a union of several possible tags.
export type LoginSuccess = Checkpoint<"LoginSuccess">;
export type LoginBadCredentials = Checkpoint<"LoginBadCredentials">;
export type LoginOutcome = LoginSuccess | LoginBadCredentials;
`;

const NAV_LOGIN_BLOCK = `
import { defineNavBlock } from "waygraph";
export const NavLoginBlock = defineNavBlock({
  name: "nav-login",
  checkpoint: "LoginPage",
  url: "/login",
});
`;

const SUBMIT_LOGIN_BLOCK = `
import { defineBlock, checkpoint } from "waygraph";
import type { LoginPage, LoginOutcome } from "../states.js";

export const SubmitLoginBlock = defineBlock<LoginPage, LoginOutcome>({
  name: "submit-login",
  instruction: {
    async act() {},
    resolve: () => checkpoint("LoginSuccess"),
  },
});
`;

const ADD_TO_CART_BLOCK = `
import { defineBlock, checkpoint } from "waygraph";
import type { Checkpoint } from "waygraph";
import type { CartPage } from "../states.js";

export const AddToCartBlock = defineBlock<Checkpoint<string>, CartPage>({
  name: "add-to-cart",
  instruction: {
    async act() {},
    resolve: () => checkpoint("CartPage"),
  },
});
`;

const UNRESOLVABLE_BLOCK = `
import { defineBlock, checkpoint } from "waygraph";

export const MysteryBlock = defineBlock({
  name: "mystery",
  instruction: {
    async act() {},
    resolve: () => checkpoint("Somewhere"),
  },
});
`;

const ADD_TO_CART_EFFECT_BLOCK = `
import { defineEffectBlock, checkpoint } from "waygraph";
import type { Checkpoint } from "waygraph";
import type { CartPage } from "../states.js";

export const AddToCartBlock = defineEffectBlock<Checkpoint<string>, CartPage>({
  name: "add-to-cart",
  requires: [],
  instruction: {
    async act() {},
    resolve: () => checkpoint("CartPage"),
  },
  async instanceOptions() { return []; },
});
`;

const ASSERT_LOGIN_BLOCK = `
import { defineAssertBlock, Trait } from "waygraph";

// Called exactly as documented - no <In, Out> generic, no hand-written
// act/resolve. Real bug this guards: this shape was silently invisible to
// discoverGraph ("Out not resolvable"), confirmed live against a real
// consumer project's own Pilot session.
export const AssertLoginBlock = defineAssertBlock({
  name: "assert-login",
  checkpoint: "LoginPage",
  verify: [Trait.visible("h1")],
});
`;

async function withFixtureProject(name: string, files: Record<string, string>, run: (dir: string) => Promise<void>) {
  const tmpDir = join(import.meta.dirname, `.tmp-${name}`);
  await mkdir(join(tmpDir, "src", "blocks"), { recursive: true });
  await mkdir(join(tmpDir, "node_modules"), { recursive: true });
  await symlink(join(import.meta.dirname, "..", ".."), join(tmpDir, "node_modules", "waygraph"), "dir");
  await writeFile(join(tmpDir, "src", "states.ts"), STATES_FILE);
  for (const [rel, contents] of Object.entries(files)) {
    await writeFile(join(tmpDir, "src", "blocks", rel), contents);
  }
  try {
    await run(tmpDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test("discoverGraph: a NavBlock's own runtime checkpoint becomes a from:'*' edge", async () => {
  await withFixtureProject("nav-only", { "nav-login.block.ts": NAV_LOGIN_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.edges).toEqual([
      { block: "nav-login", file: "src/blocks/nav-login.block.ts", from: "*", to: "LoginPage", kind: "nav" },
    ]);
    expect(graph.nodes).toEqual([{ checkpoint: "LoginPage" }]);
    expect(graph.skipped).toEqual([]);
  });
});

test("discoverGraph: a branching action Block's union Out becomes one edge per member", async () => {
  await withFixtureProject("branching", { "submit-login.block.ts": SUBMIT_LOGIN_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { block: "submit-login", file: "src/blocks/submit-login.block.ts", from: "LoginPage", to: "LoginSuccess", kind: "action" },
        { block: "submit-login", file: "src/blocks/submit-login.block.ts", from: "LoginPage", to: "LoginBadCredentials", kind: "action" },
      ]),
    );
    expect(graph.edges).toHaveLength(2);
    expect(graph.skipped).toEqual([]);
  });
});

test("discoverGraph: an inline Checkpoint<string> wildcard In resolves to '*', same as a NavBlock", async () => {
  await withFixtureProject("wildcard-in", { "add-to-cart.block.ts": ADD_TO_CART_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.edges).toEqual([
      { block: "add-to-cart", file: "src/blocks/add-to-cart.block.ts", from: "*", to: "CartPage", kind: "action" },
    ]);
    // "*" is never itself a node - only real Checkpoint tags are.
    expect(graph.nodes).toEqual([{ checkpoint: "CartPage" }]);
  });
});

test("discoverGraph: defineEffectBlock<In, Out> is discovered like defineBlock (TS salt)", async () => {
  await withFixtureProject("effect-salt", { "add-to-cart.effect.block.ts": ADD_TO_CART_EFFECT_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.skipped).toEqual([]);
    expect(graph.edges).toEqual([
      {
        block: "add-to-cart",
        file: "src/blocks/add-to-cart.effect.block.ts",
        from: "*",
        to: "CartPage",
        kind: "action",
      },
    ]);
  });
});

test("discoverGraph: a Block with no defineBlock<In, Out> generic is skipped, not crashed", async () => {
  await withFixtureProject("unresolvable", { "mystery.block.ts": UNRESOLVABLE_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.edges).toEqual([]);
    expect(graph.skipped).toEqual([
      { block: "mystery", file: "src/blocks/mystery.block.ts", reason: "no route: declare from/to with Checkpoint values" },
    ]);
  });
});

test("discoverGraph: defineAssertBlock is discovered without an explicit <In, Out> generic", async () => {
  await withFixtureProject("assert-no-generic", { "assert-login.block.ts": ASSERT_LOGIN_BLOCK }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.skipped).toEqual([]);
    expect(graph.edges).toEqual([
      { block: "assert-login", file: "src/blocks/assert-login.block.ts", from: "LoginPage", to: "LoginPage", kind: "action" },
    ]);
    expect(graph.nodes).toEqual([{ checkpoint: "LoginPage" }]);
  });
});

test("discoverGraph: a whole small project's Blocks merge into one graph", async () => {
  await withFixtureProject(
    "whole-project",
    {
      "nav-login.block.ts": NAV_LOGIN_BLOCK,
      "submit-login.block.ts": SUBMIT_LOGIN_BLOCK,
      "add-to-cart.block.ts": ADD_TO_CART_BLOCK,
    },
    async (dir) => {
      const graph = await discoverGraph(dir);
      expect(graph.edges).toHaveLength(4);
      expect(graph.nodes.map((n) => n.checkpoint).sort()).toEqual(
        ["CartPage", "LoginBadCredentials", "LoginPage", "LoginSuccess"].sort(),
      );
    },
  );
});

const NAV_DASHBOARD_SIGNED_IN = `
import { defineNavBlock } from "waygraph";

export const NavDashboardBlock = defineNavBlock({
  name: "nav-dashboard",
  checkpoint: "Dashboard",
  url: "/dashboard",
});
`;

const NAV_SETTINGS_FROM_SIGNED_IN = `
import { defineNavBlock } from "waygraph";

export const NavSettingsBlock = defineNavBlock({
  name: "nav-settings",
  checkpoint: "Settings",
  url: "/settings",
  from: ["Dashboard", "Settings"],
});
`;

const SUBMIT_LOGIN_TO_DASHBOARD = `
import { defineBlock, checkpoint } from "waygraph";
import type { Checkpoint } from "waygraph";

export const SubmitLoginBlock = defineBlock<Checkpoint<"LoginPage">, Checkpoint<"Dashboard">>({
  name: "submit-login",
  instruction: { async act() {}, resolve: () => checkpoint("Dashboard") },
});
`;

test("a Nav with `from` gets one edge per tag, and routes from the login page go through sign-in", async () => {
  await withFixtureProject(
    "nav-from",
    {
      "nav-login.block.ts": NAV_LOGIN_BLOCK,
      "submit-login.block.ts": SUBMIT_LOGIN_TO_DASHBOARD,
      "nav-settings.block.ts": NAV_SETTINGS_FROM_SIGNED_IN,
    },
    async (dir) => {
      const graph = await discoverGraph(dir);
      const settings = graph.edges.filter((e) => e.block === "nav-settings");
      expect(settings.map((e) => e.from).sort()).toEqual(["Dashboard", "Settings"]);
      expect(settings.every((e) => e.to === "Settings" && e.kind === "nav")).toBe(true);
      expect(graph.skipped).toEqual([]);

      // The bug: Settings used to be a from:"*" edge, so this was just ["nav-settings"].
      expect(findBlockPath(graph, "LoginPage", "Settings")).toEqual(["submit-login", "nav-settings"]);
      // applyPath (pilot "reach") routes with the detailed variant - same answer, with each hop's target.
      expect(findBlockPathDetailed(graph, "LoginPage", "Settings")).toEqual([
        { block: "submit-login", to: "Dashboard" },
        { block: "nav-settings", to: "Settings" },
      ]);
      // Already signed in: one hop.
      expect(findBlockPath(graph, "Dashboard", "Settings")).toEqual(["nav-settings"]);
    },
  );
});

test("a Nav without `from` is still reachable from anywhere", async () => {
  await withFixtureProject("nav-anywhere", { "nav-dashboard.block.ts": NAV_DASHBOARD_SIGNED_IN }, async (dir) => {
    const graph = await discoverGraph(dir);
    expect(graph.edges.map((e) => e.from)).toEqual(["*"]);
    expect(findBlockPath(graph, "LoginPage", "Dashboard")).toEqual(["nav-dashboard"]);
  });
});
