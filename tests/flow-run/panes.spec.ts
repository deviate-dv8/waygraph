import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Engine, MemPage, Trait, account, checkpoint, defineMethodBlock, defineNavBlock, forgetSessions, keys } from "../../src/index.js";
import { inRun, onRunEvent } from "../../src/engine/run/events.js";

/**
 * A small app: /login?user=x signs x in (a cookie), /whoami says who is signed in, /ticket shows a ticket number that
 * changes per visit. Each pane of a flow has its own cookies, or shares a pane's.
 */
let server: Server;
let base = "";
let tickets = 0;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const who = /who=(\w+)/.exec(req.headers.cookie ?? "")?.[1] ?? "nobody";
    res.setHeader("content-type", "text/html");
    if (url.pathname === "/login") {
      res.setHeader("set-cookie", `who=${url.searchParams.get("user")}; path=/`);
      res.end(`<h1 id="who">${url.searchParams.get("user")}</h1>`);
    } else if (url.pathname === "/ticket") {
      res.end(`<h1 id="who">${who}</h1><p id="ticket">T-${++tickets}</p>`);
    } else {
      res.end(`<h1 id="who">${who}</h1><input id="note">`);
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(() => new Promise<void>((done) => server.close(() => done())));
test.beforeEach(() => forgetSessions());

const Who = checkpoint("Who");
const Ticket = checkpoint("Ticket");
const TicketKey = keys("panes")<{ ticket: string }>().ticket;
const engine = new Engine();

const signIn = (user: string) => engine.map().gotoPage(defineNavBlock({ name: `login-${user}`, checkpoint: Who, url: () => `${base}/login?user=${user}` }));
const Planner = account("planner", { signIn: signIn("planner") });
const Admin = account("admin", { signIn: signIn("admin") });

const whoIs = (user: string) => Trait.text("#who", user);
const NavWho = defineNavBlock({ name: "nav-who", checkpoint: Who, url: () => `${base}/whoami` });
const NavTicket = defineNavBlock({ name: "nav-ticket", checkpoint: Ticket, url: () => `${base}/ticket` });
const TakeTicket = defineMethodBlock({
  name: "take-ticket",
  from: Ticket,
  to: Ticket,
  instruction: {
    async act(page, _input, mem) {
      mem.set(TicketKey, (await page.locator("#ticket").textContent()) ?? "");
    },
  },
});
const WriteTicket = defineMethodBlock({
  name: "write-ticket",
  from: Who,
  to: Who,
  // Not `requires`: the planner's step sets it in this run (a key a step gives isn't one the run must be given).
  instruction: {
    async act(page, _input, mem) {
      await page.locator("#note").fill(mem.get(TicketKey));
    },
    verify: [Trait.value("#note", (mem) => mem.get(TicketKey))],
  },
});
const Noop = defineMethodBlock({ name: "noop", from: Who, to: Who, instruction: { async act() {} } });

test("two people side by side: each pane signed in as its account; what one takes, the other gets", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
    .in("planner").gotoPage(NavTicket.withVerify([whoIs("planner")])).method(TakeTicket)
    .in("admin").gotoPage(NavWho.withVerify([whoIs("admin")])).method(WriteTicket)
    // Back in the planner's pane: still the planner, still on the ticket page.
    .in("planner").method(TakeTicket.withVerify([whoIs("planner")]));
  const mem = new MemPage();
  expect(await flow.run(context, mem, { page })).toEqual(Ticket);
  expect(mem.get(TicketKey)).toMatch(/^T-\d+$/);
  // The admin's pane closed with the flow; the planner played on the page the run was given.
  expect(context.browser()?.contexts().length).toBe(1);
  await expect(page.locator("#who")).toHaveText("planner");
});

test("one person, two pages: a pane with another's context shares its cookies", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { app: { as: Planner }, mail: { with: "app" } } })
    .in("app").gotoPage(NavWho.withVerify([whoIs("planner")]))
    .in("mail").gotoPage(NavWho.withVerify([whoIs("planner")]));
  await flow.run(context, new MemPage(), { page });
  expect(context.pages().length).toBe(2);
});

test("a step's failure names its pane and who is signed in there", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
    .in("planner").gotoPage(NavWho)
    .in("admin").gotoPage(NavWho).method(Noop.withVerify([whoIs("planner")]));
  const error = await flow.run(context, new MemPage(), { page }).catch((err: unknown) => String(err));
  expect(error).toContain("noop (in admin, as admin)");
});

test("the run log says each step's pane", async ({ context, page }) => {
  const events: { type: string; block?: string; pane?: string }[] = [];
  const off = onRunEvent((e) => events.push(e as never));
  try {
    const flow = engine
      .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
      .in("planner").gotoPage(NavWho)
      .in("admin").gotoPage(NavWho);
    await inRun("panes", () => flow.run(context, new MemPage(), { page }));
  } finally {
    off();
  }
  const starts = events.filter((e) => e.type === "step:start").map((e) => [e.block, e.pane]);
  expect(starts).toEqual([
    ["sign-in-as-planner", "planner"],
    ["login-planner", undefined],
    ["nav-who", "planner"],
    ["sign-in-as-admin", "admin"],
    ["login-admin", undefined],
    ["nav-who", "admin"],
  ]);
});

test("fast-forwarded steps play in their pane", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
    .in("planner").gotoPage(NavWho.withVerify([whoIs("planner")]))
    .in("admin").gotoPage(NavWho, { ff: true }).method(Noop.withVerify([whoIs("admin")]), { ff: true })
    .in("planner").method(Noop.withVerify([whoIs("planner")]));
  expect(await flow.run(context, new MemPage(), { page })).toEqual(Who);
});

test("from two screens back to one: .close(pane) closes it, and it opens afresh when used again", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { planner: { as: Planner }, admin: { as: Admin } } })
    .in("planner").gotoPage(NavWho)
    .in("admin").gotoPage(NavWho.withVerify([whoIs("admin")]))
    .in("planner").close("admin").method(Noop.withVerify([whoIs("planner")]))
    // Opened again, signed in again.
    .in("admin").gotoPage(NavWho.withVerify([whoIs("admin")]));
  const contexts: number[] = [];
  const { onRunEvent } = await import("../../src/engine/run/events.js");
  const off = onRunEvent((e) => {
    if (e.type === "step:end") contexts.push(context.browser()?.contexts().length ?? 0);
  });
  try {
    expect(await flow.run(context, new MemPage(), { page })).toEqual(Who);
  } finally {
    off();
  }
  // After the close step, one context (the planner's) until the admin's opens again.
  expect(contexts).toContain(1);
  expect(context.browser()?.contexts().length).toBe(1);
});

test("the pane on the run's own page doesn't close", async ({ context, page }) => {
  const flow = engine
    .map({ panes: { planner: {}, admin: {} } })
    .in("planner").gotoPage(NavWho)
    .in("admin").gotoPage(NavWho)
    .close("planner");
  const error = await flow.run(context, new MemPage(), { page }).catch((err: unknown) => String(err));
  expect(error).toContain(`.close("planner"): planner plays on the run's own page`);
});

test("a flow with panes says which pane a step acts in; panes are checked when the flow is built", () => {
  const flow = engine.map({ panes: { a: {}, b: {} } });
  expect(() => flow.gotoPage(NavWho)).toThrow(/say which one the step acts in with \.in\(pane\)/);
  expect(() => engine.map({ panes: { a: {}, b: { with: "c" } } })).toThrow(/isn't one of this flow's panes/);
  expect(() => engine.map({ panes: { a: {}, b: { with: "a", as: Admin } } })).toThrow(/drop its as/);
  expect(() => engine.map({ as: Admin, panes: { a: {} } })).toThrow(/each pane says who is signed in there/);
});
