// Split out of the former 950-line pilot-overlay.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { SessionSnapshot } from "../auto-session.js";
import { ensureInstalled } from "./shell.js";
import type { Page } from "@playwright/test";

/** Minimal shape needed to render the graph tree - matches WaygraphGraph. */
export interface PilotOverlayGraph {
  nodes: readonly { checkpoint: string }[];
  edges: readonly { block: string; from: string; to: string; kind: "nav" | "action" }[];
}


export interface PilotOverlayInfo {
  sessionId: string | undefined;
  snapshot: SessionSnapshot;
  /**
   * The WHOLE project's graph, not just what's reachable from the current
   * page - real, direct user request: "i have a button where it shows all
   * the nodes like a node tree stuff". Optional so a caller that doesn't
   * have it handy (or doesn't want the extra payload every call) can omit
   * it; the "All nodes" tab just shows nothing until one arrives.
   */
  graph?: PilotOverlayGraph;
}


/**
 * Refreshes the badge text and the (possibly-collapsed) panel's two tabs
 * ("Here" - current live menu; "All nodes" - whole project graph as a
 * tree). Never throws - a page mid-navigation when this fires is a real,
 * expected timing case, not an error worth failing the caller's own real
 * operation over.
 */
export async function updatePilotOverlay(page: Page, info: PilotOverlayInfo): Promise<void> {
  await ensureInstalled(page);
  await page
    .evaluate(
      async ({ sessionId, snapshot, graph }) => {
        const badge = __wgById("wg-pilot-badge");
        const current = __wgById("wg-pilot-panel-current");
        const graphPanel = __wgById("wg-pilot-panel-graph");
        if (!badge || !current || !graphPanel) return;
        const idPart = sessionId ? `session ${sessionId}` : "no session id";
        const onBlank = location.href === "about:blank" || location.protocol === "about:";
        const hereLabel = snapshot.here ?? (onBlank ? "(blank page)" : "(unknown)");
        badge.textContent = `Waygraph Pilot - ${idPart} - ${hereLabel}`;
        const totalEdges = snapshot.sections.reduce((n, s) => n + s.edges.length, 0);
        if (totalEdges === 0) {
          current.innerHTML = onBlank
            ? '<div class="wg-pilot-empty">Blank page — no Block moves yet. Use auto goto or a nav Block when ready.</div>'
            : '<div class="wg-pilot-empty">No Block moves from here right now.</div>';
        } else {
          current.innerHTML = snapshot.sections
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
        }
        if (!graph || graph.nodes.length === 0) {
          graphPanel.innerHTML = '<div class="wg-pilot-empty">No graph data yet.</div>';
          return;
        }
        // Flat indented-text tree - the ORIGINAL "All nodes" rendering.
        // Real, direct user correction: "i also dont like the all node
        // stuff. ther should be a 2d version" - kept only as a fallback for
        // when Mermaid genuinely can't load (e.g. offline), not the primary
        // rendering anymore.
        const renderTextTree = () => {
          graphPanel.innerHTML = graph.nodes
            .map((node) => {
              const outgoing = graph.edges.filter((e) => e.from === node.checkpoint || e.from === "*");
              const rows = outgoing.length
                ? outgoing
                    .map(
                      (e) =>
                        `<div class="wg-pilot-graph-edge"><span class="wg-pilot-kind">${e.kind}</span> ${e.block} -&gt; ${e.to}</div>`,
                    )
                    .join("")
                : '<div class="wg-pilot-graph-edge wg-pilot-empty">(no outgoing edges)</div>';
              const here = node.checkpoint === snapshot.here ? " (here)" : "";
              return `<div class="wg-pilot-graph-node"><div class="wg-pilot-graph-checkpoint">${node.checkpoint}${here}</div>${rows}</div>`;
            })
            .join("");
        };
        try {
          const w = window as unknown as {
            mermaid?: {
              initialize: (opts: Record<string, unknown>) => void;
              render: (id: string, src: string) => Promise<{ svg: string }>;
            };
            __wgMermaidLoadPromise?: Promise<unknown>;
          };
          if (!w.mermaid) {
            if (!w.__wgMermaidLoadPromise) {
              w.__wgMermaidLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
                script.onload = () => resolve(undefined);
                script.onerror = () => reject(new Error("mermaid script failed to load"));
                document.head.appendChild(script);
              });
            }
            await w.__wgMermaidLoadPromise;
          }
          if (!w.mermaid) throw new Error("mermaid did not attach to window after load");
          // Real, direct user request: "left to right stuff. maybe mermaid?
          // with square ish arrows???" - LR layout, linear (non-curvy) edges.
          w.mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose", flowchart: { curve: "linear" } });
          const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
          // Every Nav Block gets a `from:"*"` wildcard edge for pathfinding
          // (see auto-explore.ts's own isUrlNav comment). Real, screenshot-
          // confirmed finding, TWICE over:
          // 1. Collapsing all of these into one shared "Anywhere" hub node
          //    still broke the layout - ~9 of 10 Checkpoints have their own
          //    nav edge, so nearly every node ends up one hop from that hub
          //    and dagre stacks them in a single rank/column ("it dones't
          //    look left to right").
          // 2. Dropping them entirely (no edges, just a footnote) fixed the
          //    layout but then hid real connectivity - a node like Settings
          //    that has ONLY a nav edge looked like a disconnected orphan
          //    ("the all nodes doesn't even show the navs block... whre is
          //    settings there").
          // Neither extreme is right: a wildcard nav edge isn't really a
          // flow TRANSITION (it doesn't come from any one specific screen,
          // it's global infrastructure - the persistent sidebar), so it
          // doesn't belong in the layout-driving edge set at all, but the
          // fact that a node is directly nav-reachable is still real
          // information worth showing. Marked on the node's own label
          // instead of as a graph edge - visible on every affected node,
          // adds zero layout-warping connectivity.
          const nonWildcard = graph.edges.filter((e) => e.from !== "*");
          const navReachable = new Set(graph.edges.filter((e) => e.from === "*").map((e) => e.to));
          // Real, direct user finding (screenshot-confirmed): a self-loop
          // edge (an action that stays on the same Checkpoint, e.g.
          // "fill-email -> SignIn") renders as a spiral squiggle Mermaid
          // draws back into the same node - with several per node (every
          // fill-* / select-* action), these dominated the diagram and
          // broke the left-to-right layout dagre otherwise produces cleanly
          // for a real DAG of inter-Checkpoint transitions. Self-loops add
          // no flow information anyway (the "Here" tab already lists every
          // action from wherever you are) - excluded from the graph itself,
          // kept only as a "(+N)" count on the node label so the count
          // isn't silently lost.
          const selfLoopCounts = new Map<string, number>();
          for (const e of nonWildcard) {
            if (e.from === e.to) selfLoopCounts.set(e.from, (selfLoopCounts.get(e.from) ?? 0) + 1);
          }
          const specific = nonWildcard.filter((e) => e.from !== e.to);
          const lines = ["graph LR"];
          for (const node of graph.nodes) {
            const id = sanitize(node.checkpoint);
            const here = node.checkpoint === snapshot.here;
            const loops = selfLoopCounts.get(node.checkpoint);
            const nav = navReachable.has(node.checkpoint) ? " [nav]" : "";
            const suffix = `${here ? " (here)" : ""}${loops ? ` (+${loops})` : ""}${nav}`;
            lines.push(`  ${id}["${node.checkpoint}${suffix}"]`);
            if (here) lines.push(`  style ${id} stroke:#7C3AED,stroke-width:3px`);
          }
          for (const e of specific) {
            lines.push(`  ${sanitize(e.from)} -->|${e.block}| ${sanitize(e.to)}`);
          }
          const { svg } = await w.mermaid.render(`wg-mermaid-${Date.now()}`, lines.join("\n"));
          graphPanel.innerHTML =
            svg + `<div class="wg-pilot-graph-note">[nav] = also directly reachable via sidebar/URL from anywhere (not drawn as an edge - see the "Here" tab for what's live on this page).</div>`;
          // Real, direct user request: "i hope it is zoomed to the current
          // node" - the diagram is usually bigger than the panel, so scroll
          // (not zoom - the SVG itself stays real size, legible) the "here"
          // node into view instead of leaving it wherever dagre placed it.
          const hereId = snapshot.here ? sanitize(snapshot.here) : null;
          const hereEl = hereId ? graphPanel.querySelector(`[id^="flowchart-${hereId}-"]`) : null;
          hereEl?.scrollIntoView({ block: "center", inline: "center" });
        } catch {
          renderTextTree();
        }
      },
      { sessionId: info.sessionId, snapshot: info.snapshot, graph: info.graph ?? null },
    )
    .catch(() => {});
}
