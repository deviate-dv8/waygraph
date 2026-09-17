import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  assertWgOverlayReady,
  readWgOverlayBeacon,
  WG_READY_PANEL_SEL,
} from "../../dist/overlay-beacon.js";

const exec = promisify(execFile);
const node = process.execPath;
const CLI = join(import.meta.dirname, "..", "..", "dist", "cli.js");
const saucedemo = join(import.meta.dirname, "..", "..", "examples", "saucedemo");

/** Inject stamp helpers the same shape installOverlay installs in the page. */
async function installStampHelpers(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __wgStampModal?: (
        el: Element,
        kind: string,
        meta?: Record<string, unknown>,
      ) => void;
      __wgOverlayBeacon?: () => unknown[];
    };
    w.__wgStampModal = (el, kind, meta) => {
      if (!el) return;
      const m = meta || {};
      el.setAttribute("data-wg-ui", "1");
      el.setAttribute("data-wg-modal", kind || "panel");
      if (m.phase != null) el.setAttribute("data-wg-phase", String(m.phase));
      el.setAttribute(
        "data-wg-collapsed",
        el.classList.contains("wg-collapsed") ? "1" : "0",
      );
      el.setAttribute("data-wg-ready", m.ready === false ? "0" : "1");
    };
    w.__wgOverlayBeacon = () =>
      Array.from(document.querySelectorAll('[data-wg-ui="1"]')).map((el) => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return {
          id: el.id || null,
          modal: el.getAttribute("data-wg-modal"),
          ready: el.getAttribute("data-wg-ready") === "1",
          phase: el.getAttribute("data-wg-phase"),
          step: el.getAttribute("data-wg-step"),
          block: el.getAttribute("data-wg-block"),
          collapsed:
            el.getAttribute("data-wg-collapsed") === "1" ||
            el.classList.contains("wg-collapsed"),
          opacity: st.opacity,
          textLen: (el.textContent || "").trim().length,
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible: r.width > 0 && r.height > 0 && Number(st.opacity) > 0.05,
        };
      });
  });
}

test("assertWgOverlayReady fails on blank unstamped panel", async ({ page }) => {
  await page.setContent(
    `<div id="wg-panel" style="position:fixed;bottom:12px;left:50%;opacity:1;padding:16px;background:#1a0a2e;color:#fff;width:320px;height:80px"></div>`,
  );
  await installStampHelpers(page);
  await expect(assertWgOverlayReady(page)).rejects.toThrow(/NOT ready|Do not claim/);
});

test("assertWgOverlayReady fails when opacity is zero", async ({ page }) => {
  await page.setContent(
    `<div id="wg-panel" data-wg-ui="1" data-wg-modal="panel" data-wg-ready="1"
      style="position:fixed;bottom:12px;left:50%;opacity:0;padding:16px;background:#1a0a2e;color:#fff;width:320px">
      Step 1 / 3 · login · Run this block
    </div>`,
  );
  await expect(assertWgOverlayReady(page)).rejects.toThrow(/NOT ready/);
});

test("assertWgOverlayReady passes on stamped readable panel", async ({ page }) => {
  await page.setContent(
    `<div id="wg-panel" style="position:fixed;bottom:12px;left:50%;opacity:1;padding:16px;background:#1a0a2e;color:#fff;width:320px">
      Step 1 / 3 · login · Run this block
    </div>`,
  );
  await installStampHelpers(page);
  await page.evaluate(() => {
    const panel = document.getElementById("wg-panel")!;
    (window as unknown as { __wgStampModal: Function }).__wgStampModal(panel, "panel", {
      phase: "before",
      ready: true,
    });
  });
  const hit = await assertWgOverlayReady(page);
  expect(hit.modal).toBe("panel");
  expect(hit.ready).toBe(true);
  expect(hit.visible).toBe(true);
  expect(hit.textLen).toBeGreaterThanOrEqual(12);
  await expect(page.locator(WG_READY_PANEL_SEL)).toBeVisible();
});

test("banner and auto-panel kinds are readable via beacon", async ({ page }) => {
  await page.setContent(`
    <div id="wg-banner" style="position:fixed;top:8px;left:8px;opacity:1;padding:8px;background:#111;color:#fff">
      waygraph demo · shop
    </div>
    <div id="wg-auto-panel" style="position:fixed;bottom:12px;left:50%;opacity:1;padding:16px;background:#1a0a2e;color:#fff;width:320px">
      waygraph auto · pick next block · Quit
    </div>
  `);
  await installStampHelpers(page);
  await page.evaluate(() => {
    const stamp = (window as unknown as { __wgStampModal: Function }).__wgStampModal;
    stamp(document.getElementById("wg-banner")!, "banner", { ready: true });
    stamp(document.getElementById("wg-auto-panel")!, "auto-panel", {
      phase: "pick",
      ready: true,
    });
  });
  const rows = await readWgOverlayBeacon(page);
  expect(rows.some((r) => r.modal === "banner" && r.ready && r.visible)).toBe(true);
  expect(rows.some((r) => r.modal === "auto-panel" && r.ready && r.visible)).toBe(true);
  await assertWgOverlayReady(page, { modal: "banner", minTextLen: 8 });
  await assertWgOverlayReady(page, { modal: "auto-panel" });
});

test("WAYGRAPH_PROVE_EXIT=1 requires live demo panel beacon (anti-blank)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wg-beacon-"));
  const shot = join(dir, "prove.png");
  const data = JSON.stringify({
    "saucedemo.credentials": {
      username: "standard_user",
      password: "secret_sauce",
    },
  });
  try {
    const { stderr } = await exec(
      node,
      [CLI, "demo", "--blocks", "loginFlow", "--data", data],
      {
        cwd: saucedemo,
        env: {
          ...process.env,
          WAYGRAPH_PROVE_EXIT: "1",
          WAYGRAPH_PROVE_SHOT: shot,
          WAYGRAPH_AUTOPLAY: "0",
        },
        timeout: 90_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    expect(stderr).toMatch(/WAYGRAPH_PROVE/);
    const m = stderr.match(/WAYGRAPH_PROVE ({.*})/);
    expect(m).toBeTruthy();
    const payload = JSON.parse(m![1]!);
    expect(payload.ok).toBe(true);
    expect(payload.readyAttr).toBe("1");
    expect(Array.isArray(payload.beacons)).toBe(true);
    expect(
      payload.beacons.some(
        (b: { modal: string; ready: boolean }) => b.modal === "panel" && b.ready,
      ),
    ).toBe(true);
  } catch (e: unknown) {
    const err = e as { code?: number; stderr?: string };
    if (err.code === 2 && err.stderr && /WAYGRAPH_PROVE/.test(err.stderr)) {
      const m = err.stderr.match(/WAYGRAPH_PROVE ({.*})/);
      const payload = m ? JSON.parse(m[1]!) : {};
      throw new Error(
        "WAYGRAPH_PROVE_EXIT caught blank/missing overlay - do not claim demo works. " +
          JSON.stringify(payload),
      );
    }
    throw e;
  }
});
