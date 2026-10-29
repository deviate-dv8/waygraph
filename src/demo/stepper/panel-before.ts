// The demo panel before a step: episode and step chips, pace, the mem it reads (editable), and the Run gate.
import { stopRingTracker } from "../overlay/rings.js";
import { envFlag, envString } from "../../engine/env.js";
import { ignorePageGone, ignoreTimeout } from "../../engine/page-gone.js";
import { installOverlay } from "../overlay/overlay.js";
import type { WgPage } from "../types.js";
import { miniStepLabel, type PanelTodos, type StepPanelInfo } from "./step-panels.js";

/** The panel before a step: its description, the mem it reads (editable), and whether its episode just began. */
export interface BeforePanelInfo extends StepPanelInfo, PanelTodos {
  description: string;
  keys: readonly { name: string; value: string }[];
  justEnteredEpisode: boolean;
}


export async function renderBeforeStep(page: WgPage, info: BeforePanelInfo) {
  await installOverlay(page, info.title, info.bannerUi, info.caption, info.networkTabVisible);
  // A ring left highlighting the PREVIOUS step's element (and its live
  // resize/scroll tracker) shouldn't linger once a new step's own panel is
  // up - only relevant when a Block's act() doesn't navigate away, since a
  // real navigation already wipes document.documentElement's children.
  await stopRingTracker(page);
  await page
    .evaluate(() => {
      if (window.__wgHideRing) window.__wgHideRing();
      if (window.__wgHideCursor) window.__wgHideCursor();
    })
    .catch(ignorePageGone);
  // miniStepLabel / todosHtmlFromInfo are Node-only — browser evaluate has no closure.
  const payload = { ...info, stepLabel: miniStepLabel(info) };
  await page
    .evaluate((info) => {
      // Reused in place, not removed + recreated, every step - the old
      // remove()-then-fade-back-in cycle was a real flash on every single
      // transition (the user: "the appear and disappear... hurts eyes and
      // dizzy"). Updating one persistent element's content has nothing to
      // flash - it only ever fades in ONCE, the first time this page
      // genuinely has no panel yet (a real navigation wiped the whole
      // document, or this is the very first step).
      const { panel, isNew: isNewPanel } = window.__wgPanel!();
      const keys =
        info.keys.length === 0
          ? [__wgEl("div", { class: "wg-key text-sm text-label-3" }, "No MemKeys needed")]
          : info.keys.map((k) => {
              const field = __wgEl("textarea", { class: "field font-mono text-sm resize-y", data: { key: k.name }, attrs: { rows: 2 } });
              field.value = k.value;
              return __wgEl(
                "div",
                { class: "wg-key flex flex-col gap-1 mb-2.5" },
                __wgEl("label", { class: "font-mono text-xs font-medium text-label-2" }, k.name),
                field,
                __wgEl("div", { class: "wg-key-pretty rounded-control bg-fill px-2 py-1.5 text-sm", data: { prettyFor: k.name } }),
              );
            });
      let autoNow = false;
      try {
        autoNow = localStorage.getItem("wg-autoplay") === "1";
      } catch {
        /* private mode / blocked storage - defaults to manual */
      }
      // Todos render into the floating dock (__wgSyncTodos), never inside .wg-body: Hide would hide them.
      __wgSet(
        panel,
        window.__wgPanelFrame!(info, {
          current: info.moduleIndex,
          doneBefore: info.moduleIndex,
          progress: Math.round((info.index / info.total) * 100),
          entered: info.justEnteredEpisode,
        }),
        window.__wgPanelHeading!("Step " + (info.index + 1) + " of " + info.total, info.blockName),
        info.description ? __wgEl("p", { class: "wg-narration text-base text-label-2 mb-3" }, info.description) : null,
        keys,
        window.__wgPanelFooter!("Run Step", autoNow, "play"),
      );
      window.__wgShowPanel!(panel, isNewPanel, info, "before");
      // Live, human-readable preview of what a MemKey's raw JSON will
      // actually write - object fields become "Field: value" lines
      // (camelCase split the same way state tags already are); a
      // non-object payload (a plain string/number/array) is shown as-is.
      // Hidden entirely in JSON mode - shares the SAME global toggle the
      // result display's own Pretty/JSON buttons already set, not a
      // second, separate preference.
      const prettyMemValue = (raw: string): WgChild[] => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return [__wgEl("span", { class: "text-red" }, "Not valid JSON")];
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          return [JSON.stringify(parsed)];
        }
        return Object.entries(parsed).map(([field, value]) => {
          const label = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
          return __wgEl("div", { class: "wg-key-pretty-row" }, __wgEl("span", { class: "wg-key-pretty-label font-medium text-label-2" }, label + ":"), " " + String(value));
        });
      };
      const applyKeyPretty = () => {
        const prettyOn = window.__wgPretty !== false;
        panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
          const previewEl = ta.parentElement?.querySelector<HTMLElement>(".wg-key-pretty");
          if (!previewEl) return;
          previewEl.style.display = prettyOn ? "" : "none";
          if (prettyOn) __wgSet(previewEl, prettyMemValue(ta.value));
        });
      };
      applyKeyPretty();
      panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((ta) => {
        ta.addEventListener("input", applyKeyPretty);
      });
      const runBtn = __wgById<HTMLButtonElement>("wg-run");
      if (runBtn) {
        runBtn.addEventListener("click", () => {
          const edits: Record<string, string> = {};
          panel.querySelectorAll<HTMLTextAreaElement>("textarea[data-key]").forEach((el) => {
            edits[el.getAttribute("data-key") ?? ""] = el.value;
          });
          window.__wgNext(edits);
        });
      }
      window.__wgWireAutoplay!();
    }, payload)
    .catch(ignorePageGone);
  if (envString("WAYGRAPH_PROVE_SHOT") || envFlag("WAYGRAPH_PROVE_EXIT")) {
    // Default: prove once on first painted panel. PROVE_EVERY=1 re-checks
    // every step (noisy; useful when hunting a mid-chain blank).
    const proveEvery = envFlag("WAYGRAPH_PROVE_EVERY");
    const already = (globalThis as { __wgProveDone?: boolean; }).__wgProveDone;
    if (!already || proveEvery || envFlag("WAYGRAPH_PROVE_EXIT")) {
      await page.waitForTimeout(500).catch(ignoreTimeout);
      const shot = envString("WAYGRAPH_PROVE_SHOT");
      if (shot) await page.screenshot({ path: shot }).catch(ignorePageGone);
      const ok = await page
        .evaluate(() => {
          const beacons = typeof window.__wgOverlayBeacon === "function" ? window.__wgOverlayBeacon() : [];
          const panel = beacons.find((b) => b.modal === "panel" && b.ready && b.visible);
          const textOk = panel && panel.textLen >= 12;
          const opacityOk = panel && Number(panel.opacity) > 0.5;
          return {
            ok: !!(panel && textOk && opacityOk),
            beacons,
            hasRun: !!__wgById<HTMLButtonElement>("wg-run"),
            readyAttr: __wgById("wg-panel")?.getAttribute("data-wg-ready") || null,
          };
        })
        .catch((e: unknown) => ({ ok: false, reason: String(e instanceof Error ? e.message : e) }));
      console.error("WAYGRAPH_PROVE " + JSON.stringify(ok));
      (globalThis as { __wgProveDone?: boolean; }).__wgProveDone = true;
      if (envFlag("WAYGRAPH_PROVE_EXIT")) {
        process.exit(ok && ok.ok ? 0 : 2);
      }
    }
  }
}
