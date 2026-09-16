import { test, expect } from "@playwright/test";
import { toMermaid, type WaygraphGraph } from "../../src/graph.js";

test("toMermaid: a NavBlock's from:'*' renders as Mermaid's own [*] start marker", () => {
  const graph: WaygraphGraph = {
    nodes: [{ checkpoint: "LoginPage" }],
    edges: [{ block: "nav-login", file: "nav-login.block.ts", from: "*", to: "LoginPage", kind: "nav" }],
    skipped: [],
  };

  expect(toMermaid(graph)).toBe("stateDiagram-v2\n  [*] --> LoginPage : nav-login");
});

test("toMermaid: one line per edge, in order, labeled with the Block's own name", () => {
  const graph: WaygraphGraph = {
    nodes: [{ checkpoint: "LoginPage" }, { checkpoint: "LoggedIn" }, { checkpoint: "CartPage" }],
    edges: [
      { block: "nav-login", file: "a.ts", from: "*", to: "LoginPage", kind: "nav" },
      { block: "submit-login", file: "b.ts", from: "LoginPage", to: "LoggedIn", kind: "action" },
      { block: "nav-cart", file: "c.ts", from: "LoggedIn", to: "CartPage", kind: "nav" },
    ],
    skipped: [],
  };

  expect(toMermaid(graph)).toBe(
    [
      "stateDiagram-v2",
      "  [*] --> LoginPage : nav-login",
      "  LoginPage --> LoggedIn : submit-login",
      "  LoggedIn --> CartPage : nav-cart",
    ].join("\n"),
  );
});
