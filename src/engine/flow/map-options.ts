// The options of `engine.map({ … })` and of `.flow(sub, { … })`.
import type { DemoPace } from "../stub/pace.js";
import type { HighlightStyleDefaults } from "../stub/ring.js";
import type { MemKey } from "../mem/mem.js";
import type { Account } from "./account.js";
import type { World } from "./world.js";
import type { Device } from "./device.js";
import type { Pane } from "./panes.js";

/** Flow-level settings for `engine.map({ … })`: `memStub`, `sessionReset`, `expectedFailure`, `demoPace`, `highlightStyle`, `homeOrigin`. */
export interface MapBuilderOptions {
  /**
   * This project's own origin (e.g. `"https://app.example.com"`) - enables
   * `.gotoPage()`/`.gotoExternal()`'s origin check against a Block's static
   * `url`. Omit to skip that check entirely (still fully kind-checked either
   * way; only the internal/external origin distinction is opt-in).
   */
  homeOrigin?: string;
  /** Fill missing `requires` keys from `registerMemStub` when the flow runs. */
  memStub?: boolean;
  /**
   * `false`: run each step's `verify` but none of its expectations (the Blocks' `expect` and the steps'): a setup flow
   * nobody is judging. `--no-expect` does the same for one run.
   */
  expect?: false;
  /**
   * This flow wants a fresh browser session (cookies and storage cleared) when it runs after another one, in a CLI chain
   * (`waygraph run "a then b"`) or nested with `.flow(sub)`: a second user signing in, a logged-out check.
   */
  sessionReset?: boolean;
  /** Marks a flow that is supposed to throw, with the reason shown in the demo. */
  expectedFailure?: string;
  /** Default demo pace for the whole flow. */
  demoPace?: DemoPace;
  /** Default ring tone, size and weight for the whole flow. */
  highlightStyle?: HighlightStyleDefaults;
  /**
   * Run as this account (`account(name, { signIn })`): the flow starts signed in, from the session kept since the
   * account's first sign-in in this process, or by signing in now.
   * @example engine.map({ as: Planner }).gotoPage(NavEquipmentBlock)
   */
  as?: Account;
  /**
   * The MemKey this flow takes as its input: one flow for many cases. Its first step requires it; `--input`
   * (JSON or `@file`) gives it on the command line - an array plays the flow once per item - as do `--data`, a mem stub
   * and `.flow(sub, { input })`.
   * @example engine.map({ input: ApiCase }).gotoExternal(NavHoppscotchRestBlock).method(LoadCaseBlock)…
   */
  input?: MemKey<unknown>;
  /**
   * The device this flow plays on, over the config's `device` (default desktop): `"mobile"`, `"tablet"`, or its parts
   * (`{ preset: "mobile", orientation: "landscape" }`, `{ width: 1600, height: 900 }`). `run`, `demo` and `waygraph test
   * --flows` play it at that size; a phone or tablet layout and touch come from the browser the run started with (the
   * config's `device`), since a browser can't switch them midway.
   * @example engine.map({ device: { preset: "tablet", orientation: "landscape" } })
   */
  device?: Device;
  /**
   * Under `waygraph test --flows`, run this flow alone, after every other flow: it changes data others read (a bulk
   * delete, a settings change), or it needs the app to itself.
   */
  exclusive?: boolean;
  /**
   * The time zone the flow runs in (an IANA name): the page's clock and dates follow it; put back when the flow ends.
   * Chromium.
   * @example engine.map({ timezone: "Asia/Tokyo" })
   */
  timezone?: string;
  /**
   * The network the flow runs on: `throttle` (`"offline"`, `"slow-3g"`, `"fast-3g"`, or latency and throughput;
   * Chromium) and `faults` (requests that fail or are slow on purpose). Applied when the flow starts, put back when it
   * ends, pass or fail.
   * @example engine.map({ network: { faults: [{ url: "**\/api/orders", status: 500 }] } })
   */
  network?: World["network"];
  /**
   * The flow's panes: pages side by side, each in its own browser context (its own account and device) or sharing
   * another's (`with`). `.in(pane)` says which one the next steps act in; panes share the flow's mem.
   * @example engine.map({ panes: [Planner_, Admin_] })   // const Admin_ = pane("admin", { as: Admin, device: "tablet" })
   * @example engine.map({ panes: [App, Mail] })           // const Mail = pane("mail", { with: App })
   */
  panes?: readonly Pane[];
}

/** What `.flow()` takes for the sub-flow it runs inline. */
export interface MapFlowOpts {
  /** Clear cookies and storage right before the sub-flow, e.g. to start a second user fresh. Defaults to the sub-flow's own `sessionReset`. */
  reset?: boolean;
  /** The sub-flow's input (it declares `map({ input })`): set right before its first step. */
  input?: unknown;
}
