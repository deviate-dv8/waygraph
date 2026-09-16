import { test, expect } from "@playwright/test";
import { exploreChoices, buildExploreMenu } from "../../src/auto-explore.js";
import type { WaygraphGraph } from "../../src/graph.js";

const sample: WaygraphGraph = {
  nodes: [{ checkpoint: "LoginPage" }, { checkpoint: "LoggedIn" }],
  edges: [
    { block: "nav-login", file: "a", from: "*", to: "LoginPage", kind: "nav" },
    { block: "submit-login", file: "b", from: "LoginPage", to: "LoggedIn", kind: "action" },
    { block: "add-to-cart", file: "c", from: "LoggedIn", to: "ItemInCart", kind: "action" },
  ],
  skipped: [],
};

test("exploreChoices at LoginPage lists nav * plus actions from that checkpoint", () => {
  const choices = exploreChoices(sample, "LoginPage");
  expect(choices.map((c) => c.block)).toEqual(["nav-login", "submit-login"]);
});

test("exploreChoices when unknown lists nav Blocks only", () => {
  const choices = exploreChoices(sample, null);
  expect(choices.map((c) => c.block)).toEqual(["nav-login"]);
});

test("exploreChoices at LoggedIn excludes login-only actions", () => {
  const choices = exploreChoices(sample, "LoggedIn");
  expect(choices.map((c) => c.block)).toEqual(["add-to-cart", "nav-login"]);
});

test("buildExploreMenu at LoginPage groups forward actions", async ({ page }) => {
  await page.setContent('<button id="login-button">Login</button>');
  const library = {
    byName: new Map([
      [
        "nav-login",
        {
          block: { name: "nav-login" } as never,
          exportName: "NavLoginBlock",
          file: "a",
          kind: "nav" as const,
          description: "",
        },
      ],
      [
        "submit-login",
        {
          block: { name: "submit-login" } as never,
          exportName: "SubmitLoginBlock",
          file: "b",
          kind: "action" as const,
          description: "",
        },
      ],
    ]),
  };
  const menu = await buildExploreMenu(page, sample, library, "LoginPage");
  expect(menu.here).toBe("LoginPage");
  expect(menu.sections[0]?.title).toBe("Methods from LoginPage");
  expect(menu.flat.map((e) => e.block)).toEqual(["submit-login"]);
});

test("buildExploreMenu when unknown only offers url nav", async ({ page }) => {
  await page.setContent("<body>blank</body>");
  const library = {
    byName: new Map([
      [
        "nav-login",
        {
          block: { name: "nav-login" } as never,
          exportName: "NavLoginBlock",
          file: "a",
          kind: "nav" as const,
          description: "",
        },
      ],
    ]),
  };
  const menu = await buildExploreMenu(page, sample, library, null);
  expect(menu.sections[0]?.title).toBe("Start here");
  expect(menu.flat.map((e) => e.block)).toEqual(["nav-login"]);
});
