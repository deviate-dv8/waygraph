/**
 * A small, self-contained on-page indicator for a live AutoSession -
 * "this browser is being driven by Waygraph," plus an expandable panel
 * showing the session's own current live menu. Real, direct user request:
 * a headful Pilot session looks like an ordinary browser tab with no
 * indication anything is driving it, which matters once a human might be
 * co-driving the same visible session (see `AutoSession.resync()`'s own
 * doc comment for the related state-desync problem that scenario causes).
 *
 * Deliberately NOT built on `src/cli.ts`'s own demo-panel/banner overlay
 * system, for the same reason `pilot-v1`'s narrate-mode ring renderer
 * wasn't either (see the git history at tag
 * `waygraph-pilot-v1-logs-prettified`): `cli.ts` runs `main().catch(...)`
 * unconditionally at module load with no `import.meta.url` guard, so
 * importing anything from it here would trigger the whole CLI's argument
 * dispatch as a side effect of loading a library module - unsafe. This
 * ships its own small, purpose-built badge + panel instead.
 */
import type { Page } from "@playwright/test";
import type { SessionSnapshot } from "./auto-session.js";

const OVERLAY_CSS = `
#wg-pilot-overlay {
  position: fixed; z-index: 2147483000; bottom: 12px; right: 12px;
  font: 12px/1.4 ui-monospace, "SF Mono", Consolas, monospace;
  color: #1a1033; pointer-events: auto;
}
#wg-pilot-badge {
  background: #a78bfa; color: #1a1033; padding: 6px 10px; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); cursor: pointer; white-space: nowrap;
  font-weight: 600; user-select: none;
}
#wg-pilot-panel {
  display: none; margin-top: 6px; max-width: 420px; max-height: 320px;
  overflow-y: auto; background: #fff; color: #1a1033; border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25); padding: 8px 10px;
}
#wg-pilot-panel.wg-pilot-open { display: block; }
#wg-pilot-panel .wg-pilot-section { font-weight: 700; margin: 6px 0 2px; }
#wg-pilot-panel .wg-pilot-edge { padding: 2px 0; border-bottom: 1px solid #eee; }
#wg-pilot-panel .wg-pilot-kind { color: #7c3aed; font-weight: 600; }
#wg-pilot-panel .wg-pilot-desc { color: #666; }
#wg-pilot-panel .wg-pilot-empty { color: #888; font-style: italic; }
`;

/** Idempotent - safe to call before every update, matching narrate mode's own precedent. */
async function ensureInstalled(page: Page): Promise<void> {
  await page.addStyleTag({ content: OVERLAY_CSS }).catch(() => {});
  await page.evaluate(() => {
    if (document.getElementById("wg-pilot-overlay")) return;
    const root = document.createElement("div");
    root.id = "wg-pilot-overlay";
    root.innerHTML =
      '<div id="wg-pilot-badge"></div><div id="wg-pilot-panel"></div>';
    document.documentElement.appendChild(root);
    document.getElementById("wg-pilot-badge")!.addEventListener("click", () => {
      document.getElementById("wg-pilot-panel")!.classList.toggle("wg-pilot-open");
    });
  }).catch(() => {});
}

export interface PilotOverlayInfo {
  sessionId: string | undefined;
  snapshot: SessionSnapshot;
}

/**
 * Refreshes the badge text and the (possibly-collapsed) panel's edge list.
 * Never throws - a page mid-navigation when this fires is a real, expected
 * timing case, not an error worth failing the caller's own real operation
 * over.
 */
export async function updatePilotOverlay(page: Page, info: PilotOverlayInfo): Promise<void> {
  await ensureInstalled(page);
  await page
    .evaluate(
      ({ sessionId, snapshot }) => {
        const badge = document.getElementById("wg-pilot-badge");
        const panel = document.getElementById("wg-pilot-panel");
        if (!badge || !panel) return;
        const idPart = sessionId ? `session ${sessionId}` : "no session id";
        badge.textContent = `Waygraph Pilot - ${idPart} - ${snapshot.here ?? "(unknown)"}`;
        const totalEdges = snapshot.sections.reduce((n, s) => n + s.edges.length, 0);
        if (totalEdges === 0) {
          panel.innerHTML = '<div class="wg-pilot-empty">No moves from here right now.</div>';
          return;
        }
        const html = snapshot.sections
          .map((section) => {
            const rows = section.edges
              .map((edge) => {
                const desc = edge.description ? ` - ${edge.description}` : "";
                const label = edge.label ? ` (${edge.label})` : "";
                return `<div class="wg-pilot-edge">[${edge.index}] <span class="wg-pilot-kind">${edge.kind}</span> ${edge.block}${label} -&gt; ${edge.to}${desc}</div>`;
              })
              .join("");
            return `<div class="wg-pilot-section">${section.title}</div>${rows}`;
          })
          .join("");
        panel.innerHTML = html;
      },
      { sessionId: info.sessionId, snapshot: info.snapshot },
    )
    .catch(() => {});
}
