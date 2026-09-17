import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page, BrowserContext } from "@playwright/test";
import { Engine, start, end, locate, MemPage } from "./index.js";
import type { MemKey } from "./mem-page.js";
import type { NavBlock } from "./engine.js";
import {
  buildExploreContext,
  buildExploreMenu,
  type BlockEntry,
  type ExploreMenu,
} from "./auto-explore.js";
import type { Checkpoint } from "./types.js";
import { installDemoChrome, instrumentInteractionHighlighting } from "./step-overlay.js";

export interface AutoExploreOptions {
  /** Terminal menu (browser still runs for act()). Default false = headful picker panel. */
  cli?: boolean;
  baseURL?: string;
  /** Initial URL when the page is blank (defaults to baseURL). */
  startUrl?: string;
  /** Phase C: glob / regex / bare `--blocks` file select for discovery. */
  blocksSelect?: import("./blocks-select.js").BlocksSelect;
}

function resolveBaseUrl(projectDir: string): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        waygraph?: { baseUrl?: string; baseURL?: string };
      };
      const fromPkg = pkg.waygraph?.baseUrl ?? pkg.waygraph?.baseURL;
      if (typeof fromPkg === "string" && fromPkg.trim()) return fromPkg.trim();
    } catch {
      /* ignore */
    }
  }
  for (const name of ["playwright.config.ts", "playwright.config.mts", "playwright.config.js"]) {
    const p = join(projectDir, name);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf-8").match(/baseURL\s*:\s*["']([^"']+)["']/);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** URL-first - several Checkpoints share nav verify traits (e.g. LoggedIn = /inventory.html). */
async function inferCheckpointFromUrl(page: Page): Promise<string | null> {
  try {
    const path = new URL(page.url()).pathname;
    if (path.includes("inventory-item.html")) return "ItemDetailPage";
    if (path.includes("inventory.html")) return "LoggedIn";
    if (path.includes("cart.html")) return "CartPage";
    if (path.includes("checkout-step-one.html")) return "CheckoutInfoPage";
    if (path.includes("checkout-step-two.html")) return "CheckoutOverviewPage";
    if (path.includes("checkout-complete.html")) return "OrderComplete";
    if (path === "/" || path === "") {
      if (await page.locator("#login-button").isVisible({ timeout: 500 }).catch(() => false)) {
        return "LoginPage";
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function detectHere(page: Page, navBlocks: BlockEntry[]): Promise<string | null> {
  const fromUrl = await inferCheckpointFromUrl(page);
  if (fromUrl) return fromUrl;
  const tags = navBlocks.map((n) => n.block) as NavBlock<Checkpoint<string>>[];
  return locate(page, tags, { timeoutMs: 1500 });
}

async function ensureLivePage(
  context: BrowserContext,
  page: Page,
  startUrl: string | undefined,
): Promise<Page> {
  if (!page.isClosed()) return page;
  const fresh = await context.newPage();
  if (startUrl) {
    await fresh.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await fresh.waitForLoadState("load").catch(() => {});
  }
  return fresh;
}

function missingMemKeys(entry: BlockEntry, mem: MemPage): MemKey<unknown>[] {
  const requires = entry.block.requires ?? [];
  return requires.filter((k) => !mem.has(k));
}

const DEFAULT_CREDENTIALS = { username: "standard_user", password: "secret_sauce" };

/**
 * Saucedemo-only defaults. Exact key names only — never substring `"login"`
 * (PIA `login-email` string must stay unset; see docs/proposals/auto-login-email-seed-bug.md).
 */
export function defaultMemValueForKey(keyName: string): unknown | undefined {
  if (
    keyName === "login-credentials" ||
    keyName === "credentials" ||
    keyName === "saucedemo.credentials"
  ) {
    return DEFAULT_CREDENTIALS;
  }
  return undefined;
}

function defaultMemJsonPrompt(keyName: string): string {
  const def = defaultMemValueForKey(keyName);
  if (def !== undefined) return JSON.stringify(def);
  return "{}";
}

function seedMemFromEnv(mem: MemPage, entry: BlockEntry): boolean {
  const raw = process.env.WAYGRAPH_DATA ?? process.env.WAYGRAPH_AUTO_MEM;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of entry.block.requires ?? []) {
      if (k.name in parsed) mem.set(k, parsed[k.name]);
    }
    return missingMemKeys(entry, mem).length === 0;
  } catch {
    return false;
  }
}

/** Pre-seed known demo keys (saucedemo creds) so headful/cli do not stop for mem forms. */
function seedDefaultMem(library: Map<string, BlockEntry>, mem: MemPage): void {
  const raw = process.env.WAYGRAPH_DATA ?? process.env.WAYGRAPH_AUTO_MEM;
  let envParsed: Record<string, unknown> = {};
  if (raw) {
    try {
      envParsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  for (const entry of library.values()) {
    for (const k of entry.block.requires ?? []) {
      if (mem.has(k)) continue;
      if (k.name in envParsed) {
        mem.set(k, envParsed[k.name]);
        continue;
      }
      const def = defaultMemValueForKey(k.name);
      if (def !== undefined) mem.set(k, def);
    }
  }
}

async function promptMemCli(entry: BlockEntry, mem: MemPage): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    for (const k of missingMemKeys(entry, mem)) {
      const def = defaultMemJsonPrompt(k.name);
      const line = await rl.question(`  ${k.name} JSON [${def}]: `);
      const json = line.trim() || def;
      mem.set(k, JSON.parse(json));
    }
  } finally {
    rl.close();
  }
}

async function ensureMem(entry: BlockEntry, mem: MemPage, cli: boolean): Promise<void> {
  if (missingMemKeys(entry, mem).length === 0) return;
  if (seedMemFromEnv(mem, entry)) return;
  if (cli) {
    console.log(`\nBlock "${entry.block.name}" needs MemPage keys:`);
    await promptMemCli(entry, mem);
    return;
  }
  throw new Error(
    `Block "${entry.block.name}" needs MemPage keys - pass --data '{...}' / WAYGRAPH_DATA (or WAYGRAPH_AUTO_MEM), or enter values in --cli`,
  );
}

async function setAutoPanelRunning(page: Page, label: string): Promise<void> {
  await page
    .evaluate(
      (label) => {
        const panel = document.getElementById("wg-auto-panel");
        if (!panel) return;
        const body =
          "<h3>waygraph auto</h3><div style='padding:12px 0;color:#c9a6ff'>" +
          "Running: <strong>" +
          label +
          "</strong></div>";
        panel.innerHTML = body;
        if (typeof window.__wgWirePanelChrome === "function") {
          window.__wgWirePanelChrome(panel, "wg-auto-panel-hidden", "waygraph auto");
        }
      },
      label,
    )
    .catch(() => {});
}

async function runOneBlock(
  engine: Engine,
  entry: BlockEntry,
  context: BrowserContext,
  page: Page,
  mem: MemPage,
  headful: boolean,
): Promise<Checkpoint<string>> {
  const navClick = (entry.block as { __waygraphNavClick?: string }).__waygraphNavClick;
  if (entry.kind === "nav" && navClick !== undefined) {
    await page
      .evaluate(
        (label) => {
          window.__wgPendingNavClickLabel = label;
        },
        `nav: ${entry.block.name}`,
      )
      .catch(() => {});
  }
  if (headful) await setAutoPanelRunning(page, entry.block.name);
  const flow = engine.defineFlow([start, entry.block, end]);
  const BLOCK_TIMEOUT_MS = 45_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: Checkpoint<string>;
  try {
    const ran = await Promise.race([
      flow.run(context, mem, { page, closeOnFinish: false }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Block "${entry.block.name}" timed out after ${BLOCK_TIMEOUT_MS / 1000}s - ` +
                  "click Quit and retry, or check network / mem credentials",
              ),
            ),
          BLOCK_TIMEOUT_MS,
        );
      }),
    ]);
    result = ran.result;
  } finally {
    if (timer) clearTimeout(timer);
  }
  await page.evaluate("delete window.__wgPendingNavClickLabel").catch(() => {});
  return result;
}

const PANEL_CSS =
  "#wg-auto-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,720px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:rgba(20,10,40,.94);color:#fff;border-radius:14px;padding:16px 20px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);}" +
  "#wg-auto-panel h3{margin:0 0 10px;font-size:16px;}" +
  "#wg-auto-panel .wg-here{color:#c9a6ff;margin-bottom:12px;}" +
  "#wg-auto-panel .wg-actions{display:flex;flex-direction:column;gap:8px;}" +
  "#wg-auto-panel button.wg-act{text-align:left;padding:10px 12px;border-radius:10px;border:1px solid #5b3aa8;" +
  "background:#2a1450;color:#fff;font:13px/1.3 system-ui,sans-serif;cursor:pointer;}" +
  "#wg-auto-panel button.wg-act:hover{background:#3a1d70;}" +
  "#wg-auto-panel button.wg-act .wg-kind{color:#a78bfa;font-size:11px;text-transform:uppercase;}" +
  "#wg-auto-panel button.wg-quit{margin-top:12px;background:#3a1a1a;border-color:#7f1d1d;}" +
  "#wg-auto-panel textarea{width:100%;box-sizing:border-box;margin:6px 0 10px;background:#1a1030;color:#fff;" +
  "border:1px solid #5b3aa8;border-radius:8px;padding:8px;font:12px/1.3 monospace;}" +
  "#wg-auto-panel label.wg-mem{display:block;margin-top:8px;font-size:12px;color:#ddd;}" +
  "#wg-auto-panel .wg-section{margin:12px 0 6px;font-size:11px;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:.04em;}" +
  "#wg-auto-panel .wg-map{margin:8px 0 12px;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.25);font-size:11px;line-height:1.5;}" +
  "#wg-auto-panel .wg-map .wg-cp{opacity:.55;}#wg-auto-panel .wg-map .wg-cp-here{color:#fff;opacity:1;font-weight:700;}" +
  "#wg-auto-panel .wg-chrome{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;}" +
  "#wg-auto-panel .wg-chrome-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;}" +
  "#wg-auto-panel button.wg-hide-btn{margin:0;padding:4px 10px;font:600 11px system-ui,sans-serif;" +
  "background:#3a2a60;color:#e8dcff;border:1px solid #5b3aa8;border-radius:6px;cursor:pointer;}" +
  "#wg-auto-panel button.wg-hide-btn:hover{background:#4b2a80;}" +
  "#wg-auto-panel.wg-collapsed{width:auto;max-width:90vw;padding:8px 12px;max-height:none;overflow:hidden;}" +
  "#wg-auto-panel.wg-collapsed .wg-body{display:none;}" +
  "#wg-auto-panel.wg-collapsed .wg-chrome{margin:0;}" +
  "@media (max-width:640px){" +
  "#wg-auto-panel{left:8px;right:8px;bottom:8px;transform:none;max-width:none;width:auto;" +
  "max-height:min(55vh,calc(100vh - 16px));padding:12px 14px;border-radius:12px;}" +
  "#wg-auto-panel.wg-collapsed{left:50%;right:auto;transform:translateX(-50%);width:auto;}" +
  "#wg-auto-panel button.wg-act{padding:12px;font-size:14px;}" +
  "}";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

type PickResult = { type: "pick"; index: number } | { type: "quit" };

/** Shown in the headful panel after each Block run. */
let lastRunNote: string | null = null;

/**
 * Mem keys any Block on the current menu might read this turn - minus keys a
 * dynamic `instanceOptions` row already answers by picking it (e.g. "which
 * item to add to cart" comes from the menu row itself, not a hand-typed JSON
 * textarea).
 */
function memKeysForMenu(menu: ExploreMenu, library: Map<string, BlockEntry>): readonly MemKey<unknown>[] {
  const instanceKeys = new Set<MemKey<unknown>>();
  for (const edge of menu.flat) {
    if (edge.instanceOption) instanceKeys.add(edge.instanceOption.key);
  }
  const keys = new Map<string, MemKey<unknown>>();
  for (const edge of menu.flat) {
    const entry = library.get(edge.block);
    for (const k of entry?.block.requires ?? []) {
      if (instanceKeys.has(k)) continue;
      keys.set(k.name, k);
    }
  }
  return [...keys.values()];
}

async function syncPanelMem(page: Page, mem: MemPage, keys: readonly MemKey<unknown>[]): Promise<void> {
  if (keys.length === 0) return;
  const edits = (await page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll("textarea.wg-mem-input").forEach((ta) => {
      const key = ta.getAttribute("data-mem-key");
      if (key) out[key] = (ta as HTMLTextAreaElement).value;
    });
    return out;
  })) as Record<string, string>;
  for (const k of keys) {
    const raw = edits[k.name];
    if (raw === undefined) continue;
    try {
      mem.set(k, JSON.parse(raw));
    } catch (err) {
      throw new Error(
        `Invalid JSON for mem key "${k.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function armPickWait(): { promise: Promise<PickResult>; resolve: (v: PickResult) => void } {
  let resolve!: (v: PickResult) => void;
  const promise = new Promise<PickResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function headfulPick(
  page: Page,
  menu: ExploreMenu,
  library: Map<string, BlockEntry>,
  mem: MemPage,
  waitPick: () => Promise<PickResult>,
): Promise<PickResult> {
  const here = menu.here;
  const hereLabel =
    here ?? (menu.flat.length > 0 ? "Unknown - pick Start here" : "Unknown - no moves available");
  const menuMemKeys = memKeysForMenu(menu, library);
  let html =
    `<style id="wg-auto-style">${PANEL_CSS}</style><div id="wg-auto-panel">` +
    `<h3>waygraph auto</h3>`;
  if (lastRunNote) {
    html += `<div style="margin-bottom:8px;font-size:12px;color:#a7f3d0">${esc(lastRunNote)}</div>`;
  }
  html += `<div class="wg-here">You are here: <strong>${esc(hereLabel)}</strong></div>`;

  if (menuMemKeys.length > 0) {
    html +=
      `<div class="wg-section">Mem - edit credentials, then click a block below</div>`;
    let memIdx = 0;
    for (const k of menuMemKeys) {
      let value = "{}";
      try {
        if (mem.has(k)) value = JSON.stringify(mem.get(k), null, 2);
        else {
          const def = defaultMemValueForKey(k.name);
          if (def !== undefined) value = JSON.stringify(def, null, 2);
        }
      } catch {
        /* ignore */
      }
      html +=
        `<label class="wg-mem">${esc(k.name)}</label>` +
        `<textarea class="wg-mem-input" data-mem-key="${esc(k.name)}" id="wg-mem-${memIdx}" rows="4">${esc(value)}</textarea>`;
      memIdx++;
    }
  }

  html += `<div class="wg-actions">`;
  let idx = 0;
  if (menu.sections.length === 0) {
    html += `<div style="opacity:.85;padding:8px 0">No moves from this screen right now.</div>`;
  }
  for (const section of menu.sections) {
    html += `<div class="wg-section">${esc(section.title)}</div>`;
    for (const c of section.edges) {
      const entry = library.get(c.block);
      const navClick = (entry?.block as { __waygraphNavClick?: unknown } | undefined)?.__waygraphNavClick;
      const hl =
        c.instanceOption?.highlight ?? (typeof navClick === "string" ? navClick : undefined);
      const hlAttr = hl ? ` data-hl="${esc(hl)}"` : "";
      if (c.label) {
        html += `<button class="wg-act" data-idx="${idx}"${hlAttr}>${esc(c.label)}</button>`;
      } else {
        const desc = entry?.description ? `<br><span style="opacity:.85">${esc(entry.description)}</span>` : "";
        html +=
          `<button class="wg-act" data-idx="${idx}"${hlAttr}><span class="wg-kind">${esc(c.kind)}</span> ` +
          `<strong>${esc(c.block)}</strong> -> ${esc(c.to)}${desc}</button>`;
      }
      idx++;
    }
  }
  html += `</div><button class="wg-act wg-quit" data-quit="1">Quit</button></div>`;
  // Wrap body; chrome + Hide/Show wired in page (shared with stepper).
  html =
    `<style id="wg-auto-style">${PANEL_CSS}</style><div id="wg-auto-panel">` +
    html.slice(html.indexOf("<h3>"));

  await page.evaluate(
    `((inner) => {
      let panel = document.getElementById("wg-auto-panel");
      if (!panel) {
        panel = document.createElement("div");
        document.documentElement.appendChild(panel);
      }
      panel.outerHTML = inner;
      const root = document.getElementById("wg-auto-panel");
      if (!root) return;
      window.__wgWirePanelChrome = (el, storageKey, chromeTitle) => {
        if (!el) return;
        if (!el.querySelector(":scope > .wg-chrome")) {
          const body = document.createElement("div");
          body.className = "wg-body";
          while (el.firstChild) body.appendChild(el.firstChild);
          const chrome = document.createElement("div");
          chrome.className = "wg-chrome";
          const titleEl = document.createElement("span");
          titleEl.className = "wg-chrome-title";
          titleEl.textContent = chromeTitle || "waygraph auto";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "wg-hide-btn";
          btn.setAttribute("data-wg-toggle", "1");
          btn.textContent = "Hide";
          chrome.appendChild(titleEl);
          chrome.appendChild(btn);
          el.appendChild(chrome);
          el.appendChild(body);
        }
        const apply = (hidden) => {
          el.classList.toggle("wg-collapsed", hidden);
          const t = el.querySelector("[data-wg-toggle]");
          if (t) t.textContent = hidden ? "Show" : "Hide";
          try { localStorage.setItem(storageKey, hidden ? "1" : "0"); } catch {}
        };
        let hidden = false;
        try { hidden = localStorage.getItem(storageKey) === "1"; } catch {}
        apply(hidden);
        const toggle = el.querySelector("[data-wg-toggle]");
        if (toggle && !toggle.dataset.wgWired) {
          toggle.dataset.wgWired = "1";
          toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            apply(!el.classList.contains("wg-collapsed"));
          });
        }
      };
      window.__wgWirePanelChrome(root, "wg-auto-panel-hidden", "waygraph auto");
      root.querySelectorAll("button[data-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-idx"));
          window.__wgAutoPick?.(idx);
        });
        btn.addEventListener("mouseenter", () => {
          const sel = btn.getAttribute("data-hl");
          if (!sel) return;
          const el = document.querySelector(sel);
          if (!el || typeof window.__wgPositionRing !== "function") return;
          const r = el.getBoundingClientRect();
          if (r.width < 1 && r.height < 1) return;
          window.__wgPositionRing(
            { x: r.x, y: r.y, width: r.width, height: r.height },
            btn.textContent?.trim()?.slice(0, 80) || "target",
            "auto",
          );
        });
        btn.addEventListener("mouseleave", () => {
          window.__wgHideRing?.();
        });
      });
      const quit = root.querySelector("[data-quit]");
      if (quit) quit.addEventListener("click", () => window.__wgAutoQuit?.());
    })(${JSON.stringify(html)})`,
  );

  return waitPick();
}

function printCliMenu(menu: ExploreMenu, library: Map<string, BlockEntry>): void {
  console.log("");
  console.log(`You are here: ${menu.here ?? "Unknown (pick Start here)"}`);
  console.log("");
  if (menu.flat.length === 0) {
    console.log("  (no moves available on this page)");
  }
  let n = 0;
  for (const section of menu.sections) {
    console.log(`  -- ${section.title} --`);
    for (const c of section.edges) {
      const entry = library.get(c.block);
      n++;
      if (c.label) {
        console.log(`  [${n}] ${c.label}`);
      } else {
        const desc = entry?.description ? ` - ${entry.description}` : "";
        console.log(`  [${n}] ${c.block} (${c.kind}) -> ${c.to}${desc}`);
      }
    }
  }
  console.log("  [q] quit");
  console.log("");
}

async function cliPick(menu: ExploreMenu): Promise<PickResult> {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const ans = (await rl.question("Choose: ")).trim().toLowerCase();
      if (ans === "q" || ans === "quit") return { type: "quit" };
      const n = Number(ans);
      if (Number.isInteger(n) && n >= 1 && n <= menu.flat.length) {
        return { type: "pick", index: n - 1 };
      }
      console.log("Enter a number from the list, or q to quit.");
    }
  } finally {
    rl.close();
  }
}

/**
 * Interactive waygraph auto: locate current Checkpoint, list runnable Blocks, pick one, repeat.
 */
export async function runAutoExplore(projectDir: string, options: AutoExploreOptions = {}): Promise<void> {
  lastRunNote = null;
  const cli = options.cli === true;
  const baseURL = options.baseURL ?? resolveBaseUrl(projectDir) ?? process.env.WAYGRAPH_BASE_URL;
  const startUrl = options.startUrl ?? baseURL;
  const { graph, library } = await buildExploreContext(
    projectDir,
    options.blocksSelect ? { blocksSelect: options.blocksSelect } : undefined,
  );
  if (options.blocksSelect) {
    console.error(
      `waygraph auto: --blocks ${options.blocksSelect.raw} → ` +
        `${library.byName.size} block(s), ${graph.edges.length} edge(s)`,
    );
  }
  const mem = new MemPage();
  seedDefaultMem(library.byName, mem);
  const engine = cli ? new Engine({ headless: true }) : new Engine({ headless: false, slowMo: 250 });
  const { chromium } = await import("@playwright/test");
  const executablePath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: cli,
    args: cli ? [] : ["--start-maximized"],
  };
  if (!cli) launchOpts.slowMo = 250;
  if (executablePath) launchOpts.executablePath = executablePath;
  const browser = await chromium.launch(launchOpts);
  const contextOpts: Parameters<typeof browser.newContext>[0] = cli
    ? { viewport: { width: 1280, height: 720 } }
    : { viewport: null };
  if (baseURL) contextOpts.baseURL = baseURL;
  const context = await browser.newContext(contextOpts);
  let page = await context.newPage();
  if (startUrl) {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForLoadState("load").catch(() => {});
  }
  console.error(
    `waygraph auto: ${graph.nodes.length} checkpoint(s), ${graph.edges.length} edge(s) - ` +
      (cli ? "CLI picker (terminal menu)" : "headful picker (browser panel)"),
  );

  const pickSlot: { resolve: ((v: PickResult) => void) | null } = { resolve: null };
  let wiredPage: Page | null = null;

  async function wirePage(target: Page): Promise<void> {
    if (wiredPage === target) return;
    await target.exposeFunction("__wgAutoPick", (index: number) => {
      pickSlot.resolve?.({ type: "pick", index });
    });
    await target.exposeFunction("__wgAutoQuit", () => {
      pickSlot.resolve?.({ type: "quit" });
    });
    if (!cli) {
      await installDemoChrome(target, "", { banner: false });
      instrumentInteractionHighlighting(target, mem, 250);
    }
    wiredPage = target;
  }

  let here: string | null = null;
  try {
    for (;;) {
      page = await ensureLivePage(context, page, startUrl);
      await wirePage(page);
      const pickWait = armPickWait();
      pickSlot.resolve = pickWait.resolve;
      if (here === null) {
        here = await detectHere(page, library.navBlocks);
      }
      if (cli) console.error("waygraph auto: scanning page for moves ...");
      const menu = await buildExploreMenu(page, graph, library, here);
      if (cli) console.error(`waygraph auto: ${menu.flat.length} move(s) available`);
      if (menu.flat.length === 0) {
        const fromHere = graph.edges.filter((e) => e.from === here).map((e) => e.block);
        const missing = [...new Set(fromHere)].filter((b) => !library.byName.has(b));
        console.error(
          here
            ? `waygraph auto: no runnable Blocks on "${here}"` +
                (fromHere.length
                  ? ` (graph has: ${[...new Set(fromHere)].join(", ")}${missing.length ? `; not loaded: ${missing.join(", ")}` : ""})`
                  : " - nothing on this page matches the graph.") +
                (cli ? "" : " Tip: waygraph auto --cli")
            : "waygraph auto: location unknown - pick nav-login (Start here) if shown.",
        );
        if (cli) break;
      }

      let pick: PickResult;
      if (cli) {
        printCliMenu(menu, library.byName);
        pick = await cliPick(menu);
      } else {
        pick = await headfulPick(page, menu, library.byName, mem, () => pickWait.promise);
      }

      if (pick.type === "quit") break;

      if (pick.index < 0 || pick.index >= menu.flat.length) continue;
      const edge = menu.flat[pick.index]!;
      const entry = library.byName.get(edge.block);
      if (!entry) {
        console.error(`waygraph auto: Block "${edge.block}" not loaded - skipped`);
        continue;
      }

      try {
        if (edge.instanceOption) {
          mem.set(edge.instanceOption.key, edge.instanceOption.value);
        }
        if (!cli && (entry.block.requires?.length ?? 0) > 0) {
          await syncPanelMem(page, mem, entry.block.requires ?? []);
        } else {
          await ensureMem(entry, mem, cli);
        }
        const pickLabel = edge.label ?? entry.block.name;
        console.error(`waygraph auto: running [${pick.index + 1}] ${pickLabel} ...`);
        const result = await runOneBlock(engine, entry, context, page, mem, !cli);
        // Trust block output over locate() - nav verify traits collide on /dashboard.
        here = result.__state ?? edge.to;
        lastRunNote = `${entry.block.name} -> ${here}`;
        console.error(`waygraph auto: ran ${entry.block.name} -> ${here}`);
      } catch (err) {
        lastRunNote = `${entry.block.name} failed`;
        console.error(`waygraph auto: ${entry.block.name} failed - ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }
}
