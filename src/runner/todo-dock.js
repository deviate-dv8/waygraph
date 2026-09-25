// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { join } from "node:path";
import { advanceTodoDock } from "../highlights.js";
import { demoLog } from "./demo-log.js";

function todosHtmlFromInfo(info, escFn) {
  const list = info.todos || [];
  if (!list.length) return "";
  return (
    "<ul id=\"wg-todos\">" +
    list
      .map((t) => {
        const cls = t.current ? "wg-todo-current" : t.done ? "wg-todo-done" : "wg-todo-pending";
        const mark = t.done ? "\u2713" : t.current ? "\u2192" : "\u25CB";
        return (
          "<li class=\"" +
          cls +
          "\"><span class=\"wg-todo-mark\">" +
          mark +
          "</span><span>" +
          escFn(t.text || "") +
          "</span></li>"
        );
      })
      .join("") +
    "</ul>"
  );
}


/** Flatten dock items in order (sequential groups). */
function flattenTodoDockItems(dock) {
  const items = [];
  if (!dock || !dock.groups) return items;
  for (const g of dock.groups) {
    for (const t of g.items || []) items.push(t);
  }
  return items;
}


/**
 * Resolve which todo index a matched stub should advance to.
 * Prefer stub.todo / stub.slotId / stub.id against item.id; never jump backward.
 */
function resolveTodoAdvanceIndex(dock, stub, stubIndex) {
  const items = flattenTodoDockItems(dock);
  if (!items.length) return stubIndex;
  const curIdx = items.findIndex((t) => t.current);
  let idx = stubIndex;
  const key = stub && (stub.todo || stub.slotId || stub.id);
  if (key) {
    const k = String(key).trim().toLowerCase();
    let found = items.findIndex((t) => t.id && String(t.id).toLowerCase() === k);
    if (found < 0) {
      // username -> login-user, password -> login-pass, submit -> login-submit
      const aliases = {
        username: ["login-user", "user", "email"],
        password: ["login-pass", "pass"],
        submit: ["login-submit", "login", "tap-login"],
        user: ["login-user", "username"],
        pass: ["login-pass", "password"],
      };
      const alts = aliases[k] || [];
      for (const a of alts) {
        found = items.findIndex((t) => t.id && String(t.id).toLowerCase() === a);
        if (found >= 0) break;
      }
    }
    if (found < 0) {
      found = items.findIndex(
        (t) =>
          (t.id && String(t.id).toLowerCase().includes(k)) ||
          (t.text && String(t.text).toLowerCase().includes(k)),
      );
    }
    if (found >= 0) idx = found;
  }
  // Monotonic: never retreat the walkthrough.
  if (curIdx >= 0 && idx < curIdx) idx = curIdx;
  return idx;
}


/** Advance sequential todo dock to stubIndex and push to the page (Method act). */
export async function syncTodoDockAdvance(page, todoDockRef, stubIndex, stub) {
  if (!todoDockRef || stubIndex < 0) return;
  const prev = todoDockRef.current;
  if (!prev) return;
  const idx = resolveTodoAdvanceIndex(prev, stub || null, stubIndex);
  const advanced = advanceTodoDock(prev, idx);
  todoDockRef.current = advanced;
  demoLog(
    "  todo advance -> idx=" +
      idx +
      (stub && (stub.slotId || stub.todo)
        ? " slot=" + (stub.todo || stub.slotId)
        : " stub#" + stubIndex) +
      ' current="' +
      String(
        (flattenTodoDockItems(advanced).find((t) => t.current) || {}).text || "",
      ).slice(0, 40) +
      '"',
  );
  await page
    .evaluate((dock) => {
      if (window.__wgSyncTodos) {
        window.__wgSyncTodos({ sync: "set", dock });
      }
    }, advanced)
    .catch(() => {});
}

export async function probeTodoDocksOnPage(page) {
  return page
    .evaluate(() => {
      const docks = [...document.querySelectorAll(".wg-todo-dock, #wg-todo-dock")];
      return docks.map((el) => {
        const r = el.getBoundingClientRect();
        const items = el.querySelectorAll("li");
        let current = "";
        items.forEach((li) => {
          if (li.classList.contains("wg-todo-current")) {
            current = (li.textContent || "").replace(/s+/g, " ").trim().slice(0, 48);
          }
        });
        return {
          key: el.getAttribute("data-wg-todo-key") || el.id || "?",
          pos: el.dataset.pos || "?",
          top: Math.round(r.top),
          left: Math.round(r.left),
          w: Math.round(r.width),
          h: Math.round(r.height),
          onScreen: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
          n: items.length,
          current,
        };
      });
    })
    .catch(() => []);
}
