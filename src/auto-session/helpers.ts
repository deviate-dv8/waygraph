// Split out of the former 1,078-line auto-session.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { StubPhaseResult } from "../highlights.js";
import type { BlockEntry, ExploreMenu } from "../auto-explore.js";
import type { PickResult } from "../auto-explore-run.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** True when a stub-phase result actually carries authored content worth keeping. */
export function stubPhaseHasContent(r: StubPhaseResult): boolean {
  return (
    Object.keys(r.highlights).length > 0 ||
    r.todos.length > 0 ||
    r.device !== undefined ||
    r.todoDock !== undefined
  );
}


export interface SessionSnapshotEdge {
  /** 1-based, matching the numbers a human/agent picks by (same as printCliMenu). */
  index: number;
  block: string;
  kind: "nav" | "action";
  to: string;
  label?: string;
  description?: string;
}


export interface SessionSnapshotSection {
  title: string;
  edges: SessionSnapshotEdge[];
}


export interface SessionSnapshot {
  here: string | null;
  sections: SessionSnapshotSection[];
  /** True when there are no runnable moves from `here` right now. */
  done: boolean;
  lastRunNote: string | null;
}


/** Plain, JSON-serializable view of a menu - no Block/MemKey/class references. */
export function buildSessionSnapshot(
  menu: ExploreMenu,
  library: Map<string, BlockEntry>,
  here: string | null,
  lastRunNote: string | null,
): SessionSnapshot {
  let n = 0;
  const sections: SessionSnapshotSection[] = menu.sections.map((section) => ({
    title: section.title,
    edges: section.edges.map((edge) => {
      n++;
      const entry = library.get(edge.block);
      return {
        index: n,
        block: edge.block,
        kind: edge.kind,
        to: edge.to,
        ...(edge.label ? { label: edge.label } : {}),
        ...(entry?.description ? { description: entry.description } : {}),
      };
    }),
  }));
  return { here, sections, done: menu.flat.length === 0, lastRunNote };
}


export type ParsedPick = PickResult | { type: "invalid"; reason: string };


/**
 * Same number/`q`/range rules `cliPick` already applies, but returning a
 * result instead of looping to re-prompt - one request gets one answer.
 * Also accepts a Block name (exact, case-sensitive) as a shorthand for its
 * menu index - `send <id> "submit-login"` instead of hunting the number.
 * Ambiguous (the same Block name appearing more than once in one menu)
 * refuses rather than guessing which occurrence was meant - a pick runs a
 * real browser action, not something to silently get wrong.
 */
export function parsePick(raw: string, menu: { readonly flat: readonly { readonly block: string }[] }): ParsedPick {
  const ans = raw.trim();
  const lower = ans.toLowerCase();
  if (lower === "q" || lower === "quit") return { type: "quit" };
  const n = Number(lower);
  if (Number.isInteger(n) && n >= 1 && n <= menu.flat.length) {
    return { type: "pick", index: n - 1 };
  }
  const matches: number[] = [];
  menu.flat.forEach((edge, i) => {
    if (edge.block === ans) matches.push(i);
  });
  if (matches.length === 1) {
    return { type: "pick", index: matches[0]! };
  }
  if (matches.length > 1) {
    return {
      type: "invalid",
      reason: `"${raw}" matches ${matches.length} menu entries - use the numeric index instead of the Block name`,
    };
  }
  return {
    type: "invalid",
    reason: `"${raw}" is not a valid pick - enter a number from 1 to ${menu.flat.length}, a Block name, or "q" to quit`,
  };
}


export interface DomSnapshot {
  mode: "aria" | "full";
  selector?: string;
  /** Always false for aria mode - Playwright's own ariaSnapshotJSON bounds itself. */
  truncated: boolean;
  tree: unknown;
}


export interface InspectDomOptions {
  mode?: "aria" | "full";
  /** Scopes either mode to one element's subtree - a modifier, not a third mode. */
  selector?: string;
  depth?: number;
}


export type InspectDomResult =
  | { ok: true; snapshot: DomSnapshot }
  | { ok: false; error: string };


export const FULL_MODE_DEFAULT_DEPTH = 12;

export const FULL_MODE_MAX_NODES = 800;

export const FULL_MODE_MAX_TEXT_LENGTH = 300;


interface FullDomNode {
  tag: string;
  attrs?: Record<string, string>;
  text?: string;
  children?: FullDomNode[];
}


export interface FullDomCaps {
  depth: number;
  maxNodes: number;
  maxTextLength: number;
}


/** Runs entirely inside the browser (page.evaluate) - no closures over outer TS state. */
export function walkFullDom(root: Element, caps: FullDomCaps): { tree: FullDomNode; truncated: boolean } {
  let count = 0;
  let truncated = false;
  function walk(el: Element, depth: number): FullDomNode | null {
    if (depth > caps.depth) {
      truncated = true;
      return null;
    }
    if (count >= caps.maxNodes) {
      truncated = true;
      return null;
    }
    count++;
    const node: FullDomNode = { tag: el.tagName.toLowerCase() };
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
    if (Object.keys(attrs).length > 0) node.attrs = attrs;
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (directText) {
      node.text =
        directText.length > caps.maxTextLength
          ? directText.slice(0, caps.maxTextLength) + "..."
          : directText;
    }
    const children: FullDomNode[] = [];
    for (const child of Array.from(el.children)) {
      if (count >= caps.maxNodes) {
        truncated = true;
        break;
      }
      const c = walk(child, depth + 1);
      if (c) children.push(c);
    }
    if (children.length > 0) node.children = children;
    return node;
  }
  const tree = walk(root, 0) ?? { tag: root.tagName.toLowerCase() };
  return { tree, truncated };
}


export interface AutoSessionInit {
  projectDir: string;
  baseURL?: string;
  startUrl?: string;
  blocksSelect?: import("../blocks-select.js").BlocksSelect;
  /** Absolute paths — merged Block libraries (see `waygraph browser --inject`). */
  inject?: string[];
  /** When true, open about:blank instead of baseURL/startUrl (browser default). */
  skipInitialNavigation?: boolean;
  /** Default true. false launches a real visible browser window. */
  headless?: boolean;
  /**
   * Shown on the on-page Pilot overlay badge, when known - purely cosmetic,
   * this class has no other use for it. `auto --cli --detach`'s spawned
   * child (`runAutoServeCommand`) always knows and passes its own generated
   * id; a directly-constructed `AutoSession` (e.g. in a test) simply omits
   * it, and the badge shows "no session id" instead.
   */
  sessionId?: string;
}


export type ApplyPickResult =
  | { ok: true; snapshot: SessionSnapshot; quit: boolean }
  | { ok: false; error: string };


export type ApplyPathResult =
  | { ok: true; path: string[]; snapshot: SessionSnapshot }
  | { ok: false; error: string };


/**
 * One Checkpoint/Block-level step in a session's history - not a raw action
 * recording (no clicks/fills). Kept lean by design: an agent that wants DOM
 * evidence at a specific step already has `inspectDom` to call itself.
 */
export interface TraceStep {
  block: string;
  from: string | null;
  to?: string;
  error?: string;
  timestamp: string;
  /**
   * Resolved demo-narration fixtures (highlights/todos/device), when the
   * Block actually authors `stubBefore`/`stubAfter`/`stubOnError` - the same
   * data `waygraph demo`'s lifecycle logging already computes (`runStubPhase`
   * in highlights.ts), reused here for extra context on what a step meant to
   * convey. Omitted when the Block has none, or the result carries nothing.
   */
  stubBefore?: StubPhaseResult;
  stubAfter?: StubPhaseResult;
  stubOnError?: StubPhaseResult;
}


export const TRACE_MAX_STEPS = 500;


export type StubFileKind = "image" | "pdf" | "video";


/**
 * Real, minimal, valid fixture files bundled at `assets/stubs/` - not
 * placeholder/renamed-empty files: `stub.png` is a real 1x1 PNG,
 * `stub.pdf` a real single-page PDF, `stub.mp4` a real ffmpeg-encoded
 * 1s black clip. Real, direct user request: Blind Pilot hitting a real
 * `<input type="file">` (e.g. an avatar upload) had no way to supply
 * anything without a human handing over a real file each time - these are
 * small enough to ship in the package and pass most apps' basic file-type
 * checks (magic bytes, not just extension).
 */
/**
 * Public so a Block a consumer writes can reach the same real fixture files
 * `rawUpload` uses - not just the raw primitive. Needed when a real upload
 * flow has no stable `<input type="file">` to hand a selector to at all
 * (e.g. one created on the fly inside a click handler, then immediately
 * `.click()`'d to open the OS picker and possibly torn down right after) -
 * a Block's own `act()` should pair this with `page.waitForEvent("filechooser")`
 * around the triggering click, not go hunting for a selector that may not
 * exist for more than a moment.
 */
export function stubFilePath(kind: StubFileKind): string {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const names: Record<StubFileKind, string> = {
    image: "stub.png",
    pdf: "stub.pdf",
    video: "stub.mp4",
  };
  return join(packageRoot, "assets", "stubs", names[kind]);
}


/**
 * Real gap found live (Blind Pilot against veciro.com): a form submit that
 * does nothing observable in the DOM - no navigation, no visible error text -
 * is undiagnosable through `inspectDom` alone, since a silent client-side
 * validation failure or a failed network request never touches the DOM at
 * all. `auto dom` reads what's rendered; this reads what the page/network
 * actually SAID, independent of whether the app chose to show it.
 */
export interface ConsoleLogEntry {
  type: "console" | "pageerror" | "response";
  level?: string;
  text: string;
  url?: string;
  status?: number;
  timestamp: string;
}


export const CONSOLE_LOG_MAX_ENTRIES = 200;


export interface ServiceWorkerRegistrationInfo {
  scope: string;
  activeUrl?: string;
  state?: string;
}


export interface CookieInfo {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
}


export interface StorageSnapshot {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: CookieInfo[];
  serviceWorkers: string[];
  serviceWorkerRegistrations: ServiceWorkerRegistrationInfo[];
}
