import type { Locator, Page } from "@playwright/test";
import { ensureInstalled } from "./shell.js";

type Box = { x: number; y: number; width: number; height: number };

/** Paint the gray "auto" ring (Playwright is about to act here) at a viewport rectangle. */
export async function showPilotRect(page: Page, box: Box, label: string, tone = "auto"): Promise<void> {
  await ensureInstalled(page);
  await page
    .evaluate(
      ({ box, label, tone }) => {
        const ring = __wgById("wg-ring");
        const tag = __wgById("wg-ring-label");
        if (!ring || !tag) return;
        const w = window as unknown as { __wgVisionHideTimer?: ReturnType<typeof setTimeout> };
        if (w.__wgVisionHideTimer) clearTimeout(w.__wgVisionHideTimer);
        ring.dataset.tone = tone;
        ring.dataset.size = "md";
        tag.dataset.tone = tone;
        tag.dataset.size = "md";
        tag.dataset.weight = "normal";
        ring.style.left = `${box.x - 3}px`;
        ring.style.top = `${box.y - 3}px`;
        ring.style.width = `${box.width + 6}px`;
        ring.style.height = `${box.height + 6}px`;
        tag.textContent = label;
        tag.style.left = `${Math.max(0, box.x)}px`;
        tag.style.top = `${Math.max(0, box.y - 24)}px`;
        ring.style.opacity = "1";
        tag.style.opacity = "1";
        w.__wgVisionHideTimer = setTimeout(() => {
          ring.style.opacity = "0";
          tag.style.opacity = "0";
        }, 4_000);
      },
      { box, label, tone },
    )
    .catch(() => {});
}

const LOCATOR_ACTIONS = ["click", "dblclick", "hover", "tap", "fill", "check", "uncheck", "selectOption", "press", "pressSequentially", "setInputFiles"] as const;

const patched = new WeakSet<object>();

/**
 * Every Playwright instruction a Block runs against this session's page gets a gray (auto) ring + robot
 * label first, so a human watching a pilot window sees WHAT is being driven. `dwellMs` holds the ring
 * long enough to read before the action fires (0 for headless).
 */
export function instrumentPilotActions(page: Page, dwellMs: number): void {
  const proto = Object.getPrototypeOf(page.locator("html")) as Record<string, unknown>;
  if (patched.has(proto)) return;
  patched.add(proto);
  for (const action of LOCATOR_ACTIONS) {
    const original = proto[action] as ((...a: unknown[]) => Promise<unknown>) | undefined;
    if (typeof original !== "function") continue;
    proto[action] = async function (this: Locator, ...args: unknown[]) {
      try {
        const box = await this.first().boundingBox({ timeout: 1_500 });
        if (box) {
          const desc = String(this).replace(/^locator\(['"]?|['"]?\)$/g, "").slice(0, 60);
          await showPilotRect(this.page(), box, `${action} ${desc}`);
          if (dwellMs > 0) await this.page().waitForTimeout(dwellMs);
        }
      } catch {
        /* decoration only - never block the real action */
      }
      return original.apply(this, args);
    };
  }
}
