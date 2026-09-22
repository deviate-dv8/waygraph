/**
 * Runtime coverage-gap helpers: detect live page links/buttons with no Block
 * selector or NavBlock URL in the loaded library (surfaced via console.warn →
 * `auto console`, same channel as unmapped href detection).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { exploreRoots } from "./block-inject.js";
import type { BlockEntry } from "./auto-explore.js";

const SELECTOR_LITERAL =
  /(?:locator|visible|click|fill|press|selector|getByRole)\(\s*['"`]([^'"`]+)['"`]/g;
const HASH_ID = /#([a-zA-Z][\w-]*)/g;
const DATA_TEST = /\[data-test(?:-id)?(?:=["'`][^"'`]+["'`])?\]/g;

function walkBlockAndSelFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
        walkBlockAndSelFiles(p, acc);
      } else if (/\.(block|sel)\.ts$/.test(name)) {
        acc.push(p);
      }
    } catch {
      /* ignore */
    }
  }
  return acc;
}

/** Collect selector strings from NavClick blocks and Block/*Sel source files. */
export function collectKnownInteractionSelectors(
  projectDir: string,
  library: { navBlocks: BlockEntry[] },
  inject?: string[],
): string[] {
  const out = new Set<string>();
  for (const entry of library.navBlocks) {
    const click = (entry.block as { __waygraphNavClick?: string | ((mem: unknown) => string) })
      .__waygraphNavClick;
    if (typeof click === "string") out.add(click);
  }
  for (const root of exploreRoots(projectDir, inject)) {
    for (const file of walkBlockAndSelFiles(root)) {
      const src = readFileSync(file, "utf-8");
      for (const re of [SELECTOR_LITERAL, HASH_ID, DATA_TEST]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const sel = m[0].startsWith("#") || m[0].startsWith("[") ? m[0] : (m[1] ?? m[0]);
          if (sel.startsWith("#") || sel.includes("data-test") || sel.includes("[")) {
            out.add(sel.startsWith("#") || sel.startsWith("[") ? sel : `#${sel}`);
          }
        }
      }
    }
  }
  return Array.from(out);
}

export interface UnmappedInteractionPayload {
  knownPathnames: string[];
  knownSelectors: string[];
}

/** Page-side: warn once per unmapped same-origin href or visible button. */
export function unmappedInteractionsPageScript(payload: UnmappedInteractionPayload): void {
  const w = window as unknown as {
    __wgWarnedPaths?: Set<string>;
    __wgWarnedButtons?: Set<string>;
  };
  w.__wgWarnedPaths ??= new Set<string>();
  w.__wgWarnedButtons ??= new Set<string>();

  const matchesKnown = (el: Element, selectors: string[]): boolean => {
    for (const sel of selectors) {
      try {
        if (el.matches(sel)) return true;
        if (document.querySelector(sel) === el) return true;
      } catch {
        /* invalid selector in library — skip */
      }
    }
    return false;
  };

  const seenPaths = new Set<string>();
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") || "", location.href);
    } catch {
      continue;
    }
    if (url.origin !== location.origin) continue;
    const path = url.pathname;
    if (seenPaths.has(path) || payload.knownPathnames.includes(path) || w.__wgWarnedPaths!.has(path)) {
      continue;
    }
    seenPaths.add(path);
    w.__wgWarnedPaths!.add(path);
    console.warn(
      `[waygraph] unmapped nav link on this page: ${path} - no NavBlock covers this URL; add defineNavBlock`,
    );
  }

  const buttonLike = Array.from(
    document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'),
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });

  for (const el of buttonLike) {
    const id = el.id;
    const dt = el.getAttribute("data-test") ?? el.getAttribute("data-testid");
    const name = el.getAttribute("name");
    const label =
      id
        ? `#${id}`
        : dt
          ? `[data-test="${dt}"]`
          : name
            ? `[name="${name}"]`
            : el.textContent?.trim().slice(0, 40) || el.tagName.toLowerCase();
    const key = `${el.tagName}:${label}`;
    if (w.__wgWarnedButtons!.has(key)) continue;
    if (matchesKnown(el, payload.knownSelectors)) continue;
    w.__wgWarnedButtons!.add(key);
    console.warn(
      `[waygraph] unmapped button on this page: ${label} - no Method/NavClick Block selector matches; consider defineMethodBlock or defineNavClickBlock`,
    );
  }
}
