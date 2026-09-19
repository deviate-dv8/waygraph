/**
 * Waygraph Pilot: resolves a plain-language ask to a real, reachable
 * Checkpoint using each Block's existing `description`, then either
 * narrates it (highlights the real control) or acts on it (runs the real
 * Block) - built entirely on `AutoSession`'s already-proven public surface
 * (`currentSnapshot`/`applyPick`/the small additive getters it gained for
 * this), not a new execution architecture. See
 * openspec/changes/waygraph-pilot/design.md.
 *
 * Deliberate deviation from that design's original "reuse src/cli.ts's ring
 * -rendering primitives via export" plan: `cli.ts` runs `main().catch(...)`
 * unconditionally at module load with no `import.meta.url` guard, so
 * importing anything from it here would trigger the whole CLI's argument
 * dispatch as a side effect - not safe for a library module. Its own ring
 * renderer is also deeply coupled to CLI-only terminal-logging helpers
 * (`demoLog`/`demoHighlight`/ANSI color codes), not just page rendering.
 * Rather than a risky wide extraction untangling a dozen interdependent
 * functions serving a different concern, this ships a small, self-contained,
 * narrate-mode-specific ring renderer below - same visual idea (a highlighted
 * ring + label over the real element), no cli.ts dependency, no console
 * output of its own.
 */
import type { Page } from "@playwright/test";
import type { AutoSession, SessionSnapshot, SessionSnapshotEdge, ApplyPickResult } from "./auto-session.js";

// --- Plain-language resolver -------------------------------------------

export interface ResolvedAsk {
  edge: SessionSnapshotEdge;
  /** Fraction of the ask's own meaningful tokens found in the edge's description (0-1). */
  score: number;
}

/** Common filler words stripped before scoring - matching on these would reward noise, not intent. */
const STOPWORDS = new Set([
  "a", "an", "the", "to", "in", "on", "for", "of", "and", "or", "is", "are", "do", "does",
  "did", "how", "i", "my", "me", "can", "you", "your", "please", "it", "this", "that", "with",
  "from", "at", "be", "was", "were", "will", "would", "should", "could", "want", "need",
]);

/**
 * Minimal suffix stripping - not a real stemmer, just enough to stop an exact
 * ask/description mismatch on a plain plural/verb-form ("submits" vs
 * "submit") from tying with (and losing to, by iteration order) an unrelated
 * edge that happens to share every other token. Deterministic, not the
 * embedding/LLM matcher design.md defers - a small accuracy fix within the
 * same token-overlap approach, not a different one.
 */
function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && (token.endsWith("ed") || token.endsWith("es"))) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return raw.filter((t) => !STOPWORDS.has(t)).map(stem);
}

/**
 * Below this, the best match is treated as "not confident" rather than
 * returned - a real, correct "I don't know" for a genuinely ambiguous ask,
 * not a bug to eliminate. Deterministic token-overlap scoring, not a call to
 * an external model - every edge's `description` is already required, short,
 * human-written prose, which is enough to distinguish "add an item to my
 * cart" from "check out" from "sign in" without one.
 */
const MIN_CONFIDENCE = 0.34;

/**
 * Scores `ask` against every edge reachable from the session's current
 * position (`snapshot.sections`, already scoped to `here` by
 * `AutoSession.currentSnapshot()` itself - nothing here needs a separate
 * reachability check). Returns the best match, or `null` when nothing
 * reachable is a confident match.
 */
export function resolveAsk(snapshot: SessionSnapshot, ask: string): ResolvedAsk | null {
  const askTokens = tokenize(ask);
  if (askTokens.length === 0) return null;
  const askTokenSet = new Set(askTokens);

  let best: ResolvedAsk | null = null;
  for (const section of snapshot.sections) {
    for (const edge of section.edges) {
      if (!edge.description) continue;
      const descTokens = new Set(tokenize(edge.description));
      if (descTokens.size === 0) continue;
      let overlap = 0;
      for (const t of askTokenSet) {
        if (descTokens.has(t)) overlap++;
      }
      const score = overlap / askTokenSet.size;
      if (!best || score > best.score) best = { edge, score };
    }
  }
  if (!best || best.score < MIN_CONFIDENCE) return null;
  return best;
}

// --- Narrate mode (self-contained ring renderer, see file header) --------

const PILOT_RING_CSS = `
#wg-pilot-ring {
  position: fixed; z-index: 2147483000; pointer-events: none;
  border: 3px solid #a78bfa; border-radius: 8px;
  box-shadow: 0 0 0 4px rgba(167, 139, 250, 0.25);
  transition: left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease, opacity 160ms ease;
  opacity: 0;
}
#wg-pilot-ring.wg-pilot-visible { opacity: 1; }
#wg-pilot-ring-label {
  position: fixed; z-index: 2147483001; pointer-events: none;
  background: #a78bfa; color: #1a1033; font: 600 13px system-ui, sans-serif;
  padding: 3px 8px; border-radius: 6px; opacity: 0; transition: opacity 160ms ease;
  max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#wg-pilot-ring-label.wg-pilot-visible { opacity: 1; }
`;

async function installPilotOverlay(page: Page): Promise<void> {
  await page.addStyleTag({ content: PILOT_RING_CSS }).catch(() => {});
  await page.evaluate(() => {
    if (!document.getElementById("wg-pilot-ring")) {
      const ring = document.createElement("div");
      ring.id = "wg-pilot-ring";
      document.documentElement.appendChild(ring);
    }
    if (!document.getElementById("wg-pilot-ring-label")) {
      const label = document.createElement("div");
      label.id = "wg-pilot-ring-label";
      document.documentElement.appendChild(label);
    }
  });
}

/** Returns false when `selector` matches nothing on the live page - a real, reportable failure, not silently skipped. */
async function showPilotRing(page: Page, selector: string, label: string): Promise<boolean> {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return false;
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  const box = await locator.boundingBox();
  if (!box) return false;
  await page.evaluate(
    ({ box, label }) => {
      const ring = document.getElementById("wg-pilot-ring");
      const labelEl = document.getElementById("wg-pilot-ring-label");
      if (ring) {
        ring.style.left = `${box.x - 4}px`;
        ring.style.top = `${box.y - 4}px`;
        ring.style.width = `${box.width + 8}px`;
        ring.style.height = `${box.height + 8}px`;
        ring.classList.add("wg-pilot-visible");
      }
      if (labelEl) {
        labelEl.textContent = label;
        labelEl.style.left = `${box.x}px`;
        labelEl.style.top = `${Math.max(0, box.y - 28)}px`;
        labelEl.classList.add("wg-pilot-visible");
      }
    },
    { box, label },
  );
  return true;
}

export interface NarrateResult {
  edge: SessionSnapshotEdge;
  selector: string;
  label: string;
}

/**
 * Highlights the real control that answers `resolved`'s ask, on the
 * session's real live page - reusing that Block's own `stubBefore` data
 * (`AutoSession.peekStubBefore`, already computed the same way
 * `applyPick` computes it before running). Never calls `applyPick` -
 * the session's Checkpoint/page state is unchanged afterward.
 */
export async function pilotNarrate(session: AutoSession, resolved: ResolvedAsk): Promise<NarrateResult> {
  const stub = await session.peekStubBefore(resolved.edge.block);
  const highlight = stub?.highlights[0];
  if (!highlight) {
    throw new Error(`pilot: "${resolved.edge.block}" has no stubBefore highlight data to narrate`);
  }
  const page = await session.getPage();
  await installPilotOverlay(page);
  const shown = await showPilotRing(page, highlight.selector, highlight.label);
  if (!shown) {
    throw new Error(`pilot: could not find "${highlight.selector}" on the live page to narrate`);
  }
  return { edge: resolved.edge, selector: highlight.selector, label: highlight.label };
}

// --- Agentic mode ----------------------------------------------------------

/**
 * Runs the real Block for the resolved ask via the session's own existing
 * execution path - `applyPick(String(edge.index))`, the exact mechanism
 * Phase 1 already proved end to end. No new or parallel execution logic.
 */
export async function pilotAct(session: AutoSession, resolved: ResolvedAsk): Promise<ApplyPickResult> {
  return session.applyPick(String(resolved.edge.index));
}
