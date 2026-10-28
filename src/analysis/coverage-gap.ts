/**
 * Runtime coverage-gap helpers: detect live page links/buttons with no Block
 * selector or NavBlock URL in the loaded library (surfaced via console.warn →
 * `auto console`, same channel as unmapped href detection).
 */
import { exploreRoots } from "../manifest/roots.js";
import type { BlockEntry } from "../manifest/project.js";
import { walkDir } from "../manifest/scan.js";
import { parseSource, stringLiterals, templateHeads } from "../manifest/source.js";

/** A colour like `{ color: "#fde68a" }` is not a selector. */
const STYLE_PROPERTY = /colou?r|background|fill|stroke|border|shadow/i;

/** A string that reads as a CSS selector for an element waygraph can find: an id, an attribute, or a data-test hook. */
function isSelectorLiteral(value: string, property: string | undefined): boolean {
  if (property && STYLE_PROPERTY.test(property)) return false;
  return value.includes("#") || value.startsWith("[") || value.includes("data-test");
}

/**
 * A selector built per row (`(id) => \`[data-test=add-${id}]\``) as one that matches every row: an attribute or id
 * prefix (`[data-test^="add-"]`). Undefined when its fixed start isn't one of those.
 */
function rowSelector(head: string): string | undefined {
  const attr = /^\[([\w-]+)=["']?([^"'\]]*)$/.exec(head);
  if (attr) return `[${attr[1]}^="${attr[2]}"]`;
  const id = /^#([\w-]+)$/.exec(head);
  return id ? `[id^="${id[1]}"]` : undefined;
}

/** Collect selector strings from NavClick blocks and Block / selector files (`*.block.ts`, `_sel.ts`, `*.sel.ts`). */
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
    for (const file of walkDir(root, /(\.block\.ts|[\\/._]sel\.ts)$/)) {
      const source = parseSource(file);
      for (const { value, property } of stringLiterals(source)) if (isSelectorLiteral(value, property)) out.add(value);
      for (const head of templateHeads(source)) {
        const selector = rowSelector(head);
        if (selector) out.add(selector);
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
  const w = window;
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
