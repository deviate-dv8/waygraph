// A session's console log: the page's console messages, uncaught errors, and every failed or non-GET response.
import { messageOf } from "../../engine/errors.js";
import type { Page } from "@playwright/test";
import type { ConsoleLogEntry } from "./helpers.js";

/** Records what the page logs into `push` for `auto console`. */
export function recordPageConsole(page: Page, push: (entry: ConsoleLogEntry) => void): void {
  // Attached once, on the page created here - `ensureLivePage` only swaps
  // to a fresh Page if the current one closed (a rare case, e.g. the human
  // closing the tab), not on ordinary same-page SPA navigation, which is
  // all this target (and most real sites) actually do.
  page.on("console", (msg) => {
    push({
      type: "console",
      level: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString(),
    });
  });
  page.on("pageerror", (err) => {
    push({
      type: "pageerror",
      text: messageOf(err),
      timestamp: new Date().toISOString(),
    });
  });
  page.on("response", (res) => {
    // Every failed response (the original case), PLUS every mutation
    // (non-GET) response regardless of status - a real gap found live:
    // "auto console" only logging failures made a SUCCESSFUL POST that
    // simply didn't navigate anywhere look identical to "nothing
    // happened at all," undiagnosable the same way a real failure was.
    // A mutation's outcome (2xx or not) is always diagnostically
    // relevant; a GET's usually isn't (assets, trackers) unless it failed.
    const method = res.request().method();
    if (res.status() < 400 && method === "GET") return;
    push({
      type: "response",
      text: `${method} ${res.statusText()}`,
      url: res.url(),
      status: res.status(),
      timestamp: new Date().toISOString(),
    });
  });
}
