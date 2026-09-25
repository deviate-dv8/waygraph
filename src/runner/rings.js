// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { ANSI, ansiPaint, demoFixture, demoHighlight, demoLog } from "./demo-log.js";
import { playSwipeTrail } from "./cursor.js";
import { advanceTodoDock, formatHighlightCaption, normalizeHighlightSize, normalizeHighlightTone, normalizeHighlightWeight, normalizeTodos, resolveFixtureDwellMs } from "../highlights.js";
import { join } from "node:path";

/**
 * Scroll a locator into view for demo theater.
 * Prefer CSS smooth scroll + scrollend wait. Do NOT call Playwright's
 * scrollIntoViewIfNeeded first - that jumps instantly and makes the
 * following smooth scroll a no-op (looks like a teleport), especially
 * noticeable under --fast when dwell is shorter.
 * Pass opts.instant=true only for skipTheater / blitz.
 */
export async function ensureLocatorInView(locator, opts) {
  const instant = !!(opts && opts.instant);
  try {
    if (instant) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      return;
    }
    // Touch mode: if the target is off-screen, show a swipe trail in the
    // finger direction that would scroll it into view (not device morph).
    const scrollPlan = await locator
      .evaluate((el) => {
        if (!el || typeof el.getBoundingClientRect !== "function") return null;
        const touch =
          window.__wgDeviceTouch === true ||
          document.documentElement.dataset.wgTouch === "1" ||
          window.__wgDevicePreset === "mobile" ||
          window.__wgDevicePreset === "tablet";
        if (!touch) return null;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth || 390;
        const vh = window.innerHeight || 844;
        const margin = 48;
        const below = r.top > vh - margin;
        const above = r.bottom < margin;
        const right = r.left > vw - margin;
        const left = r.right < margin;
        if (!below && !above && !left && !right) return null;
        // Finger direction to reveal the target (swipe up => content moves up).
        let dir = "up";
        if (below) dir = "up";
        else if (above) dir = "down";
        else if (right) dir = "left";
        else if (left) dir = "right";
        return { dir, hint: "scroll" };
      })
      .catch(() => null);
    if (scrollPlan && scrollPlan.dir) {
      demoLog("  swipe trail dir=" + scrollPlan.dir + " hint=scroll");
      await playSwipeTrail(locator.page(), {
        dir: scrollPlan.dir,
        label: "swipe \u00b7 scroll",
        hint: "scroll",
        ms: Number(process.env.WAYGRAPH_SWIPE_MS || 650),
      });
    }
    await locator
      .evaluate(async (el) => {
        if (!el || typeof el.scrollIntoView !== "function") return;
        const waitScroll = (node, ms) =>
          new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              try {
                node.removeEventListener("scrollend", finish);
              } catch {
                /* ignore */
              }
              clearTimeout(t);
              resolve();
            };
            const t = setTimeout(finish, ms);
            try {
              node.addEventListener("scrollend", finish, { once: true });
            } catch {
              /* scrollend unsupported - timeout only */
            }
          });
        try {
          el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        } catch {
          try {
            el.scrollIntoView({ block: "center", inline: "center" });
          } catch {
            try {
              el.scrollIntoView(true);
            } catch {
              /* ignore */
            }
          }
        }
        await waitScroll(document.scrollingElement || document.documentElement, 650);
        let p = el.parentElement;
        while (p && p !== document.documentElement && p !== document.body) {
          const st = getComputedStyle(p);
          const ox = st.overflowX;
          const oy = st.overflowY;
          if (/(auto|scroll|overlay)/.test(ox) || /(auto|scroll|overlay)/.test(oy)) {
            const er = el.getBoundingClientRect();
            const pr = p.getBoundingClientRect();
            if (er.left < pr.left || er.right > pr.right || er.top < pr.top || er.bottom > pr.bottom) {
              const left = p.scrollLeft + (er.left + er.width / 2 - (pr.left + pr.width / 2));
              const top = p.scrollTop + (er.top + er.height / 2 - (pr.top + pr.height / 2));
              try {
                p.scrollTo({ left, top, behavior: "smooth" });
              } catch {
                p.scrollLeft = left;
                p.scrollTop = top;
              }
              await waitScroll(p, 650);
            }
          }
          p = p.parentElement;
        }
      })
      .catch(() => {});
  } catch {
    /* best-effort */
  }
}


export async function ensureSelectorInView(page, selector, opts) {
  await ensureLocatorInView(page.locator(selector).first(), opts);
}


export async function applyHighlightZoom(page, selector, zoom, zoomOut) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 1.001) {
    await page.evaluate(() => {
      window.__wgZoomOutOnHide = true;
      if (window.__wgClearZoom) window.__wgClearZoom();
    }).catch(() => {});
    return;
  }
  demoFixture("zoom", "ctx/ring zoom(" + z + ") zoomOut=" + (zoomOut !== false), selector);
  await page
    .evaluate(
      ({ sel, scale, zoomOut }) => {
        // false = keep camera after ring hide (ctx.zoomOut(false) / ring.zoomOut).
        window.__wgZoomOutOnHide = zoomOut !== false;
        if (window.__wgApplyZoom) window.__wgApplyZoom(sel, scale);
      },
      { sel: selector, scale: z, zoomOut: zoomOut !== false },
    )
    .catch(() => {});
}


async function applyHighlightFocus(page, box, focus) {
  if (!focus || !box) {
    await page
      .evaluate(() => {
        if (window.__wgClearFocus) window.__wgClearFocus();
      })
      .catch(() => {});
    return;
  }
  demoFixture("focus", "ctx/ring focus(true)", {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.width),
    h: Math.round(box.height),
  });
  await page
    .evaluate((b) => {
      if (window.__wgApplyFocus) window.__wgApplyFocus(b);
    }, box)
    .catch(() => {});
}


export async function cycleHighlightRings(page, highlights, gatesFast, opts) {
  const list = highlights || [];
  // defaultHoldMs: when set (fail path), use instead of legacy 900/200 so BUG
  // rings stay visible ~2s before the error panel (PIA stubOnError RFC).
  const defaultHoldMs = opts && opts.defaultHoldMs != null ? opts.defaultHoldMs : null;
  const pace = opts && opts.pace !== undefined ? opts.pace : undefined;
  let dock = opts && opts.todoDock;
  const advanceTodos = !(opts && opts.advanceTodos === false);
  // Push stubAfter/before dock before the first ring so Method after-panels
  // show the updated checklist immediately (not only after the ring cycle).
  if (dock) {
    await page
      .evaluate((d) => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
      }, dock)
      .catch(() => {});
  } else if (opts && opts.todoSync === "clear") {
    await page
      .evaluate(() => {
        if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "clear" });
      })
      .catch(() => {});
  }
  let lastRingEndedAt = null;
  for (let i = 0; i < list.length; i++) {
    const h = list[i];
    const ringStarted = Date.now();
    try {
      await ensureSelectorInView(page, h.selector);
      await applyHighlightZoom(page, h.selector, h.zoom, h.zoomOut);
      // Prefer live in-page rect (honors device-shell scale) over Playwright box.
      const box = await page
        .evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }, h.selector)
        .catch(() => null);
      if (box && box.width > 0 && box.height > 0) {
        await showRing(page, box, h.label, h.tone || "planned", {
          size: h.size,
          weight: h.weight,
          selector: h.selector,
          focus: !!h.focus,
        });
        // focus is applied by FollowRing / showRing - no second apply needed
        // Do NOT advanceTodoDock by ring index after stubAfter already set
        // progress - that reset current back to 0 and the next block looked
        // blank. Mid-act Method advance still uses syncTodoDockAdvance.
        if (dock && advanceTodos) {
          dock = advanceTodoDock(dock, i);
          if (opts && opts.todoDockRef) opts.todoDockRef.current = dock;
          await page
            .evaluate((d) => {
              if (window.__wgSyncTodos) window.__wgSyncTodos({ sync: "set", dock: d });
            }, dock)
            .catch(() => {});
        } else if (!dock && ((opts && opts.todos && opts.todos.length) || (h.todos && h.todos.length))) {
          const rows =
            opts && opts.todos && opts.todos.length
              ? opts.todos
              : normalizeTodos(h.todos, h.todoIndex);
          await page
            .evaluate((todos) => {
              if (window.__wgSyncTodos) {
                window.__wgSyncTodos({ sync: "set", list: todos });
                return;
              }
              // Fallback for pages that never got installOverlay sync helper.
              const ul = __wgById("wg-todos");
              if (!ul) return;
              ul.innerHTML = todos
                .map((t) => {
                  const cls = t.current
                    ? "wg-todo-current"
                    : t.done
                      ? "wg-todo-done"
                      : "wg-todo-pending";
                  const mark = t.done ? "\u2713" : t.current ? "\u2192" : "\u25CB";
                  const esc = (s) =>
                    String(s)
                      .replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;");
                  return (
                    "<li class=\"" +
                    cls +
                    "\"><span class=\"wg-todo-mark\">" +
                    mark +
                    "</span><span>" +
                    esc(t.text || "") +
                    "</span></li>"
                  );
                })
                .join("");
            }, rows)
            .catch(() => {});
        }
        const authored = resolveFixtureDwellMs(h, { gatesFast, pace });
        const legacyMs = i === list.length - 1 ? 200 : 900;
        const holdMs =
          authored != null ? authored : defaultHoldMs != null ? defaultHoldMs : legacyMs;
        const gap = lastRingEndedAt != null ? ringStarted - lastRingEndedAt : null;
        const holdExtra =
          "hold=" +
          holdMs +
          "ms" +
          (authored != null ? " authored" : " default") +
          " box=" +
          Math.round(box.x) +
          "," +
          Math.round(box.y) +
          " " +
          Math.round(box.width) +
          "x" +
          Math.round(box.height) +
          (gap != null ? " gap=" + gap + "ms" : "");
        demoHighlight(h, holdExtra);
        demoLog(
          "  highlight " +
            (i + 1) +
            "/" +
            list.length +
            (gap != null && gap < 120 ? ansiPaint(ANSI.yellow, " WARN gap<120ms") : "") +
            (holdMs < 250 && list.length > 1 ? ansiPaint(ANSI.yellow, " WARN short hold") : ""),
        );
        await new Promise((res) => setTimeout(res, holdMs));
        lastRingEndedAt = Date.now();
      } else {
        demoHighlight(h, "SKIP no boundingBox");
      }
    } catch (err) {
      demoHighlight(
        h || { selector: h && h.selector, label: "(error)" },
        "SKIP " + String(err && err.message ? err.message : err).slice(0, 80),
      );
    }
  }
  if (list.length > 0) {
    const last = list[list.length - 1];
    await page
      .evaluate((h) => {
        if (!window.__wgFollowRing && !window.__wgPositionRing) return;
        if (window.__wgFollowRing) {
          window.__wgFollowRing(
            h.selector,
            h.label,
            h.tone || "planned",
            { size: h.size || "md", weight: h.weight || "normal" },
            !!h.focus,
          );
          return;
        }
        const reposition = () => {
          const el = document.querySelector(h.selector);
          if (!el) {
            if (window.__wgHideRing) window.__wgHideRing();
            return;
          }
          const box = el.getBoundingClientRect();
          window.__wgPositionRing(box, h.label, h.tone || "planned", {
            size: h.size || "md",
            weight: h.weight || "normal",
          });
          if (h.focus && window.__wgApplyFocus) {
            window.__wgApplyFocus({
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
            });
          }
        };
        reposition();
        window.__wgRingTrack = reposition;
        window.addEventListener("resize", reposition);
        window.addEventListener("scroll", reposition, true);
      }, last)
      .catch(() => {});
  } else {
    await hideRing(page);
  }
}


export async function showRing(page, box, label, tone, style) {
  const size = normalizeHighlightSize(style && style.size);
  const weight = normalizeHighlightWeight(style && style.weight);
  const selector = style && style.selector ? String(style.selector) : "";
  const focus = !!(style && style.focus);
  await page
    .evaluate(
      ({ box, label, tone, size, weight, selector, focus }) => {
        if (selector && window.__wgFollowRing) {
          window.__wgFollowRing(selector, label, tone || "planned", { size, weight }, focus);
          return;
        }
        if (window.__wgStopRingFollow) window.__wgStopRingFollow();
        if (window.__wgPositionRing) {
          window.__wgPositionRing(box, label, tone || "planned", { size, weight });
        }
        if (focus && box && window.__wgApplyFocus) window.__wgApplyFocus(box);
        else if (!focus && window.__wgClearFocus) window.__wgClearFocus();
      },
      { box, label, tone: tone || "planned", size, weight, selector, focus },
    )
    .catch(() => {});
}


/** Match a locator to a stubBefore slot by overlapping bounding boxes. */
async function matchStubForLocator(page, locator, stubs) {
  if (!stubs || stubs.length === 0) return null;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return null;
  for (const s of stubs) {
    try {
      const b = await page.locator(s.selector).first().boundingBox();
      if (
        b &&
        Math.abs(b.x - box.x) < 4 &&
        Math.abs(b.y - box.y) < 4 &&
        Math.abs(b.width - box.width) < 8
      ) {
        return s;
      }
    } catch {
      /* skip */
    }
  }
  return null;
}


/** 0-based stub index for Method fill/click todo advance; -1 if none. */
export async function matchStubIndexForLocator(page, locator, stubs) {
  if (!stubs || stubs.length === 0) return -1;
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return -1;
  for (let i = 0; i < stubs.length; i++) {
    const s = stubs[i];
    try {
      const b = await page.locator(s.selector).first().boundingBox();
      if (
        b &&
        Math.abs(b.x - box.x) < 4 &&
        Math.abs(b.y - box.y) < 4 &&
        Math.abs(b.width - box.width) < 8
      ) {
        return i;
      }
    } catch {
      /* skip */
    }
  }
  return -1;
}


export async function captionForLocator(page, locator, stubs, fallback) {
  const matched = await matchStubForLocator(page, locator, stubs);
  if (matched) {
    return {
      label: formatHighlightCaption(matched),
      tone: normalizeHighlightTone(matched.tone),
      size: normalizeHighlightSize(matched.size),
      weight: normalizeHighlightWeight(matched.weight),
    };
  }
  return { label: fallback, tone: "auto", size: "md", weight: "normal" };
}


export async function dwellMatchedStub(page, locator, stubs, pacing) {
  const matched = await matchStubForLocator(page, locator, stubs);
  if (!matched) return;
  const ms = resolveFixtureDwellMs(matched, {
    gatesFast: !!(pacing && pacing.gatesFast),
    pace: pacing && pacing.demoPace,
  });
  if (ms != null && ms > 0) {
    await new Promise((res) => setTimeout(res, ms));
  }
}


export async function hideRing(page) {
  await page
    .evaluate(() => {
      if (window.__wgHideRing) window.__wgHideRing();
    })
    .catch(() => {});
}


/**
 * True if the engine's own narrate() (waygraph's public export, for a Block
 * author explicitly captioning one action) JUST positioned the ring for
 * THIS action, moments ago - the automatic per-fill/per-click narration
 * below should not immediately overwrite an author's own explicit caption
 * with its generic guess.
 */
export async function wasJustNarrated(page) {
  return page
    .evaluate(() => {
      const w = window;
      return typeof w.__wgLastNarrate === "number" && Date.now() - w.__wgLastNarrate < 500;
    })
    .catch(() => false);
}
