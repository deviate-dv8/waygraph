// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { WAYGRAPH_RING_CSS } from "../highlights.js";
import { cursorCss } from "../ui/components/cursor.js";
import { SURFACE } from "../ui/tokens.js";

// ---------------------------------------------------------------------------
// WAYGRAPH_STEP=1 - human-verification overlay: one Block at a time, a
// browser-injected panel showing/editing that Block's MemKeys, a "Run this
// step" gate, then a highlight ring over whatever its own verify Traits just
// confirmed, then a "Next" gate before moving on. Ring CSS borrowed from
// help-center-clip-engine's video-pipeline overlay (same purple ring +
// label-under-box language, minus everything camera/narration-specific).
// Purely CLI-level orchestration - no engine changes, no change to the
// non-STEP path above.
export const RING_CSS =
  // Shared with pilot-overlay.ts's showPilotVision - same ring/label CSS,
  // one source of truth (highlights.ts), so a Blind Pilot vision ring and a
  // demo stepper ring never visually drift apart.
  WAYGRAPH_RING_CSS +
  // Mouse cursor icon that travels to a target before it's acted on, plus a
  // quick expanding ripple at the moment of a click - same idea as
  // help-center-clip-engine's #clip-cursor/#clip-ring (video-pipeline). The
  // shape itself is an inline SVG set as innerHTML in installOverlay below
  // (dark fill + white stroke, same as the clip-engine's own cursor) - a
  // plain solid-white CSS clip-path (the first attempt here) had no outline
  // at all and all but disappeared against this app's light background.
  // Travel duration is JS-driven per call via --wg-cursor-ms, same reason
  // the clip engine's own comment gives: a hardcoded CSS duration would
  // make the speed param a no-op.
  cursorCss() +
  // Spotlight: dim everything except the highlight target (focus: true).
  "#wg-focus-veil{position:fixed;z-index:2147483644;pointer-events:none;" +
  "border-radius:12px;box-shadow:0 0 0 9999px rgba(8,4,20,.62);" +
  "opacity:0;transition:opacity .3s ease,left .3s ease,top .3s ease,width .3s ease,height .3s ease;}" +
  "#wg-focus-veil.wg-in{opacity:1;}" +
  // Touch swipe trail (mobile/tablet orientation + device theater).
  "#wg-swipe-layer{position:fixed;inset:0;z-index:2147483646;pointer-events:none;" +
  "overflow:hidden;}" +
  "#wg-swipe-layer .wg-swipe-dot{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;" +
  "border-radius:50%;background:rgba(147,197,253,.55);border:2px solid rgba(255,255,255,.85);" +
  "box-shadow:0 0 12px rgba(59,130,246,.55);opacity:0;}" +
  "#wg-swipe-layer .wg-swipe-finger{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;" +
  "border-radius:50%;background:rgba(15,23,42,.92);border:2px solid #fff;" +
  "box-shadow:0 4px 16px rgba(0,0,0,.4);opacity:0;" +
  "transition:left .05s linear,top .05s linear,opacity .15s ease;}" +
  "#wg-swipe-layer .wg-swipe-label{position:absolute;left:50%;top:18%;transform:translateX(-50%);" +
  "padding:6px 12px;border-radius:999px;background:rgba(15,23,42,.88);color:#e0f2fe;" +
  "border:1px solid rgba(56,189,248,.55);font:700 12px/1.2 system-ui,sans-serif;" +
  "letter-spacing:.04em;text-transform:uppercase;opacity:0;transition:opacity .25s ease;}" +
  "#wg-swipe-layer.wg-in .wg-swipe-label{opacity:1;}" +
  "#wg-panel{position:fixed;z-index:2147483647;left:50%;bottom:12px;transform:translateX(-50%);" +
  "max-width:min(92vw,640px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;" +
  "background:" + SURFACE + ";color:#fff;border-radius:14px;" +
  "padding:16px 20px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);" +
  // .06s was tuned back when the panel was removed and recreated on
  // EVERY step - fast was the only way to avoid feeling laggy. Now that
  // routine per-step updates reuse the same element (no fade at all - see
  // the panel-reuse fix), this only ever fires for a genuinely fresh DOM
  // (first load, or a real navigation - which is exactly what an episode
  // boundary is). Slower and smoother reads as a real, comfortable
  // transition instead of an instant pop - "eyes friendly," not laggy,
  // since it no longer costs anything on the common case.
  "opacity:0;transition:opacity .35s ease;}" +
  "#wg-panel.wg-in{opacity:1;}" +
  "#wg-panel .wg-auto{margin-top:10px;font:600 13px system-ui,sans-serif;color:#c9a6ff;}" +
  "#wg-panel .wg-autoplay-row{margin-top:8px;}" +
  "#wg-panel .wg-autoplay-row label{display:inline-flex;align-items:center;gap:6px;" +
  "font:12px system-ui,sans-serif;color:#b8a0e0;cursor:pointer;user-select:none;}" +
  "#wg-panel .wg-autoplay-row input{margin:0;cursor:pointer;}" +
  "#wg-panel h3{margin:0 0 8px;font-size:13px;color:#c9a6ff;font-weight:700;" +
  "letter-spacing:.02em;text-transform:uppercase;}" +
  // Sits ABOVE the per-Block "Step i/N" heading - the episode/scenario
  // this Block belongs to, not another block-level label. Only rendered
  // when the chain spec actually named a real Flow (chainFlow tags it via
  // BlockInfo.resetSessionBefore's sibling metadata) - a plain ad hoc
  // block chain shows no episode heading at all.
  "#wg-panel .wg-episode{margin:0 0 6px;font:700 15px system-ui,sans-serif;color:#fff;" +
  "padding-bottom:6px;border-bottom:1px solid rgba(124,58,237,.35);}" +
  // Pace chip - numbers speak in the overlay (2.5x / 4500ms / slow).
  "#wg-panel .wg-pace{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;" +
  "padding:6px 10px;border-radius:8px;background:rgba(124,58,237,.22);" +
  "border:1px solid rgba(124,58,237,.45);font:600 12px/1.35 system-ui,sans-serif;color:#f0e8ff;}" +
  "#wg-panel .wg-pace-badge{display:inline-block;padding:2px 8px;border-radius:999px;" +
  "background:#7C3AED;color:#fff;font:800 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;" +
  "text-transform:uppercase;}" +
  "#wg-panel .wg-pace[data-pace-kind=slow] .wg-pace-badge," +
  "#wg-panel .wg-pace[data-pace-kind=num-slow] .wg-pace-badge{background:#EAB308;color:#1c1917;}" +
  "#wg-panel .wg-pace[data-pace-kind=fast] .wg-pace-badge," +
  "#wg-panel .wg-pace[data-pace-kind=blitz] .wg-pace-badge{background:#22C55E;color:#052e16;}" +
  "#wg-panel .wg-pace[data-pace-kind=ms] .wg-pace-badge{background:#3B82F6;color:#fff;}" +
  "#wg-panel .wg-narration{margin:0 0 12px;font:italic 14px/1.4 system-ui,sans-serif;color:#f0e8ff;}" +
  // Todo checklist(s) float outside #wg-panel so --mini / Hide never hide them.
  // Multiple docks (one per todoId) are supported - stacked on the same side.
  // Click a dock to slide left <-> right (WAYGRAPH_TODO_POS / --todo-left|right).
  ".wg-todo-dock,#wg-todo-dock{position:fixed;z-index:2147483646;top:72px;left:14px;" +
  "width:min(280px,42vw);max-height:calc(100vh - 100px);overflow:auto;box-sizing:border-box;" +
  "padding:10px 12px;background:" + SURFACE + ";color:#fff;border-radius:12px;" +
  "border:1px solid rgba(124,58,237,.45);box-shadow:0 8px 24px rgba(0,0,0,.35);" +
  "pointer-events:auto;cursor:pointer;" +
  "transition:transform .4s cubic-bezier(.22,1,.36,1),top .35s ease,opacity .25s ease,z-index 0s;transform:translateX(0);}" +
  ".wg-todo-dock[data-pos=right],#wg-todo-dock[data-pos=right]{transform:translateX(calc(100vw - 100% - 28px));}" +
  ".wg-todo-dock[data-pos=left],#wg-todo-dock[data-pos=left]{transform:translateX(0);}" +
  /* While a highlight ring is up: sit under the ring so captions stay readable. */
  ".wg-todo-dock.wg-todo-behind,#wg-todo-dock.wg-todo-behind{z-index:2147483643;opacity:.42;}" +
  /* Collision tuck: shrink so a mid-page ring can still breathe. */
  ".wg-todo-dock[data-tucked=\"1\"],#wg-todo-dock[data-tucked=\"1\"]{max-height:min(28vh,220px);}" +
  /* Compact + cap: fold overflow rows; hover / data-expanded reveals more. */
  ".wg-todo-dock[data-compact=\"1\"]:not(:hover):not([data-expanded=\"1\"]) li.wg-todo-fold{display:none;}" +
  ".wg-todo-dock[data-compact=\"1\"]:is(:hover,[data-expanded=\"1\"]) li.wg-todo-fold-deep{display:none;}" +
  ".wg-todo-dock .wg-todo-more{display:flex;align-items:center;gap:6px;margin-top:6px;padding:5px 8px;" +
  "border-radius:8px;background:rgba(124,58,237,.22);border:1px solid rgba(124,58,237,.4);" +
  "font:700 11px/1.2 system-ui,sans-serif;color:#e8dcff;cursor:pointer;user-select:none;}" +
  ".wg-todo-dock .wg-todo-more:hover{background:rgba(124,58,237,.35);}" +
  ".wg-todo-dock .wg-todo-dock-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;margin:0 0 8px;}" +
  ".wg-todo-dock .wg-todos-list,#wg-todo-dock #wg-todos,.wg-todo-dock #wg-todos{list-style:none;margin:0;padding:0;background:transparent;border:none;}" +
  // Always-on zoom HUD - bottom-right (top-left is crowded: todos + banners).
  "#wg-zoom-badge{position:fixed;z-index:2147483646;bottom:14px;right:14px;" +
  "display:flex;align-items:center;gap:7px;padding:6px 11px 6px 8px;" +
  "border-radius:999px;background:" + SURFACE + ";color:#f0e8ff;" +
  "border:1px solid rgba(250,204,21,.6);box-shadow:0 6px 18px rgba(0,0,0,.4);" +
  "font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;" +
  "opacity:1;transform:translateY(0);}" +
  "#wg-zoom-badge .wg-zoom-ico{width:18px;height:18px;display:flex;align-items:center;justify-content:center;" +
  "border-radius:6px;background:rgba(250,204,21,.22);}" +
  "#wg-zoom-badge .wg-zoom-ico svg{width:14px;height:14px;display:block;}" +
  "#wg-zoom-badge .wg-zoom-val{color:#fde68a;font-variant-numeric:tabular-nums;font-weight:800;min-width:3.2em;}" +
  "#wg-zoom-badge[data-zoomed=\"1\"]{border-color:#fbbf24;}" +
  // Typing chip (method fills: username / password / etc.)
  "#wg-typing-badge{position:fixed;z-index:2147483646;bottom:88px;left:50%;transform:translateX(-50%);" +
  "display:flex;align-items:center;gap:8px;padding:8px 14px;" +
  "border-radius:999px;background:rgba(20,10,40,.95);color:#e0f2fe;" +
  "border:1px solid rgba(56,189,248,.55);box-shadow:0 8px 22px rgba(0,0,0,.4);" +
  "font:700 12px/1.2 system-ui,sans-serif;pointer-events:none;" +
  "opacity:0;transition:opacity .2s ease;}" +
  "#wg-typing-badge.wg-in{opacity:1;}" +
  "#wg-typing-badge .wg-ty-dots{letter-spacing:.15em;color:#7dd3fc;}" +
  // Device toast + chip (0.13.2+) - icon toast on fixture change, then compact chip.
  "#wg-device-toast{position:fixed;z-index:2147483647;top:14px;right:14px;" +
  "display:flex;align-items:center;gap:10px;min-width:200px;max-width:min(92vw,320px);" +
  "padding:12px 14px;border-radius:14px;background:rgba(20,10,40,.96);color:#f0e8ff;" +
  "border:1px solid rgba(124,58,237,.55);box-shadow:0 10px 28px rgba(0,0,0,.4);" +
  "font:600 13px/1.35 system-ui,sans-serif;pointer-events:none;" +
  "opacity:0;transform:translateX(18px) scale(.96);" +
  "transition:opacity .35s ease,transform .45s cubic-bezier(.22,1,.36,1);}" +
  "#wg-device-toast.wg-in{opacity:1;transform:translateX(0) scale(1);}" +
  "#wg-device-toast.wg-out{opacity:0;transform:translateX(12px) scale(.98);}" +
  "#wg-device-toast[data-preset=mobile]{border-color:#3B82F6;}" +
  "#wg-device-toast[data-preset=tablet]{border-color:#22C55E;}" +
  "#wg-device-toast[data-preset=desktop]{border-color:#9CA3AF;}" +
  "#wg-device-toast .wg-dev-icon{flex:0 0 auto;width:36px;height:36px;border-radius:10px;" +
  "display:flex;align-items:center;justify-content:center;background:rgba(124,58,237,.28);}" +
  "#wg-device-toast[data-preset=mobile] .wg-dev-icon{background:rgba(59,130,246,.28);}" +
  "#wg-device-toast[data-preset=tablet] .wg-dev-icon{background:rgba(34,197,94,.28);}" +
  "#wg-device-toast[data-preset=desktop] .wg-dev-icon{background:rgba(156,163,175,.28);}" +
  "#wg-device-toast .wg-dev-icon svg{width:22px;height:22px;display:block;}" +
  "#wg-device-toast .wg-dev-copy{flex:1 1 auto;min-width:0;}" +
  "#wg-device-toast .wg-dev-title{font:800 13px/1.2 system-ui,sans-serif;color:#fff;}" +
  "#wg-device-toast .wg-dev-sub{margin-top:3px;font:600 11px/1.3 system-ui,sans-serif;" +
  "color:#c9a6ff;letter-spacing:.02em;}" +
  "#wg-device-badge{position:fixed;z-index:2147483646;top:14px;right:14px;" +
  "display:inline-flex;align-items:center;gap:6px;padding:6px 10px 6px 8px;" +
  "border-radius:999px;background:rgba(20,10,40,.92);color:#f0e8ff;" +
  "border:1px solid rgba(124,58,237,.5);font:700 11px/1.2 system-ui,sans-serif;" +
  "letter-spacing:.04em;text-transform:uppercase;pointer-events:none;" +
  "box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;transform:translateY(-4px);" +
  "transition:opacity .3s ease,transform .35s cubic-bezier(.22,1,.36,1);}" +
  "#wg-device-badge.wg-in{opacity:1;transform:translateY(0);}" +
  "#wg-device-badge[data-preset=mobile]{border-color:#3B82F6;}" +
  "#wg-device-badge[data-preset=tablet]{border-color:#22C55E;}" +
  "#wg-device-badge[data-preset=desktop]{border-color:#9CA3AF;}" +
  "#wg-device-badge .wg-dev-icon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;}" +
  "#wg-device-badge .wg-dev-icon svg{width:14px;height:14px;display:block;}" +
  "#wg-device-badge .wg-dev-label{white-space:nowrap;}" +
  "#wg-cursor[data-touch=1]{width:28px;height:28px;}" +
  "#wg-todos,.wg-todos-list{list-style:none;margin:0 0 12px;padding:8px 10px;background:#0f0620;border-radius:8px;" +
  "border:1px solid #3a2a60;}" +
  "#wg-todos li,.wg-todos-list li{display:flex;gap:8px;align-items:flex-start;margin:0 0 6px;font:600 12.5px/1.35 system-ui,sans-serif;}" +
  "#wg-todos li:last-child,.wg-todos-list li:last-child{margin-bottom:0;}" +
  "#wg-todos .wg-todo-mark,.wg-todos-list .wg-todo-mark{flex:0 0 auto;width:1.1em;text-align:center;}" +
  "#wg-todos .wg-todo-done,.wg-todos-list .wg-todo-done{color:#6ee7b7;text-decoration:line-through;opacity:.85;}" +
  "#wg-todos .wg-todo-current,.wg-todos-list .wg-todo-current{color:#fff;}" +
  "#wg-todos .wg-todo-pending,.wg-todos-list .wg-todo-pending{color:#9a7ad1;}" +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-pending," +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-current," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-pending," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-current{color:#e8dcff;}" +
  "#wg-todos[data-wg-todo-style=bullets] .wg-todo-mark," +
  ".wg-todos-list[data-wg-todo-style=bullets] .wg-todo-mark{color:#c9a6ff;}" +
  "#wg-progress{height:4px;background:#2a1650;border-radius:2px;margin:0 0 12px;overflow:hidden;}" +
  "#wg-progress-bar{height:100%;background:#7C3AED;border-radius:2px;transition:width .3s ease;}" +
  // A real tab bar for episodes - the currently-active episode reads as
  // active (filled underline, full-brightness text), every other episode
  // reads as inactive (dimmed, no underline) - Dan's own ask: "if episode
  // 1 is active, the episode 2 tab is inactive." Only rendered when the
  // chain spec actually named real Flows (chainFlow tags each via
  // BlockInfo - same gate the "Episode N:" heading already uses); an
  // ad hoc block chain with no episodes shows no tab bar at all.
  "#wg-episodes{display:flex;gap:4px;margin:0 0 10px;border-bottom:1px solid #3a2a60;}" +
  "#wg-episodes .wg-ep-tab{padding:6px 14px 8px;font:600 12px system-ui,sans-serif;" +
  "border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;}" +
  "#wg-episodes .wg-ep-current{color:#fff;border-bottom-color:#7C3AED;}" +
  "#wg-episodes .wg-ep-done{color:#9a7ad1;}" +
  "#wg-episodes .wg-ep-upcoming{color:#5a4a80;}" +
  // A one-time, gentle signal for "you just entered this episode" - Dan:
  // "i want a clear ui eyes friendly to remind me that i am on next
  // episode." A slow outward glow, not an opacity blink/strobe (that's
  // exactly the kind of flashing that already caused the original
  // complaint) - plays once (no loop), 1.1s, only on the FIRST block of a
  // newly-entered episode, not on every step within it.
  "@keyframes wg-ep-enter{0%{box-shadow:0 0 0 0 rgba(124,58,237,.55);}" +
  "100%{box-shadow:0 0 0 10px rgba(124,58,237,0);}}" +
  "#wg-episodes .wg-ep-entered{border-radius:6px;animation:wg-ep-enter 1.1s ease-out;}" +
  // Block strip: carousel (default) or classic wrap (--full).
  "#wg-modules.wg-modules-carousel{display:flex;flex-wrap:nowrap;gap:8px;margin:0 0 10px;" +
  "overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;" +
  "padding:4px 2px 8px;scrollbar-width:thin;}" +
  "#wg-modules.wg-modules-carousel .wg-mod{flex:0 0 auto;scroll-snap-align:center;" +
  "padding:6px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;}" +
  "#wg-modules.wg-modules-carousel .wg-mod-current{transform:scale(1.06);" +
  "box-shadow:0 0 0 2px rgba(124,58,237,.45);}" +
  "#wg-modules.wg-modules-full{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;}" +
  "#wg-modules.wg-modules-full .wg-mod{padding:3px 9px;border-radius:6px;font:600 11px system-ui,sans-serif;}" +
  "#wg-modules .wg-mod-done{background:#2a1650;color:#9a7ad1;}" +
  "#wg-modules .wg-mod-current{background:#7C3AED;color:#fff;}" +
  "#wg-modules .wg-mod-upcoming{background:transparent;color:#5a4a80;border:1px solid #3a2a60;}" +
  "#wg-banner{position:fixed;z-index:2147483647;top:14px;max-width:320px;" +
  "background:" + SURFACE + ";color:#fff;border-radius:12px;padding:10px 16px;" +
  "font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.3);" +
  "border:1px solid rgba(124,58,237,.4);cursor:pointer;user-select:none;}" +
  "#wg-banner[data-pos=left]{left:14px;right:auto;transform:none;}" +
  "#wg-banner[data-pos=center]{left:50%;right:auto;transform:translateX(-50%);}" +
  "#wg-banner[data-pos=right]{right:14px;left:auto;transform:none;}" +
  "#wg-banner .wg-banner-tag{display:block;font-size:10px;font-weight:700;color:#c9a6ff;" +
  "letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px;}" +
  "#wg-panel .wg-key{margin:8px 0;}" +
  // A live, human-readable preview of what's about to be written for this
  // MemKey - Dan: "i want pretty to exist in memkeys too... it shows what
  // input its gonig to be written." Same global Pretty/JSON preference the
  // result display already has (window.__wgPretty) - hidden entirely in
  // JSON mode, since the raw textarea already speaks for itself there.
  "#wg-panel .wg-key-pretty{margin-top:4px;font:12px/1.5 system-ui,sans-serif;" +
  "background:#0f0620;border-radius:6px;padding:6px 8px;}" +
  "#wg-panel .wg-key-pretty-row{color:#f0e8ff;}" +
  "#wg-panel .wg-key-pretty-label{color:#9a7ad1;font-weight:600;}" +
  "#wg-panel label{display:block;font-size:12px;color:#d8c8ff;margin-bottom:3px;}" +
  "#wg-panel textarea{width:100%;box-sizing:border-box;background:#0f0620;color:#fff;" +
  "border:1px solid #4b2a80;border-radius:8px;padding:6px 8px;font:12px/1.3 monospace;resize:vertical;}" +
  "#wg-panel button{margin-top:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;" +
  "padding:8px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;}" +
  "#wg-panel button:hover{background:#6b2fd6;}" +
  "#wg-panel button:disabled{background:#4b2a80;cursor:default;opacity:.7;}" +
  "#wg-panel textarea:disabled{opacity:.6;}" +
  "#wg-panel .wg-result{font:12px/1.4 monospace;background:#0f0620;border-radius:8px;padding:8px;" +
  "margin:8px 0;white-space:pre-wrap;}" +
  "#wg-panel .wg-result-pretty{font:600 14px/1.4 system-ui,sans-serif;}" +
  "#wg-panel .wg-toggle{display:flex;gap:4px;margin:0 0 4px;}" +
  "#wg-panel .wg-toggle button{margin:0;padding:3px 10px;font:600 11px system-ui,sans-serif;" +
  "background:transparent;border:1px solid #4b2a80;color:#9a7ad1;border-radius:6px;}" +
  "#wg-panel .wg-toggle button.wg-active{background:#4b2a80;color:#fff;}" +
  "#wg-panel.wg-error{border:1.5px solid #e0475c;}" +
  "#wg-panel .wg-error-heading{color:#ff8fa0;}" +
  "#wg-panel .wg-error-msg{font:12px/1.5 monospace;background:#2a0f16;color:#ffc7cf;" +
  "border-radius:8px;padding:10px;margin:0 0 12px;white-space:pre-wrap;max-height:200px;overflow-y:auto;}" +
  "#wg-panel .wg-error-actions{display:flex;gap:8px;}" +
  "#wg-panel .wg-error-stop{background:#e0475c;margin-top:0;}" +
  "#wg-panel .wg-error-stop:hover{background:#c33a4c;}" +
  "#wg-panel .wg-error-retry{background:#2a9d6f;margin-top:0;}" +
  "#wg-panel .wg-error-retry:hover{background:#22855e;}" +
  "#wg-panel.wg-expected{border:1.5px solid #e0a53e;}" +
  "#wg-panel .wg-expected-heading{color:#ffcf7a;}" +
  "#wg-panel .wg-expected-reason{font:600 12.5px/1.5 system-ui,sans-serif;background:#2a2410;" +
  "color:#ffe6ae;border-radius:8px;padding:10px;margin:0 0 8px;}" +
  // Hide / Show chrome: collapsed = compact "N / M · block" pill + Next (manual).
  "#wg-panel .wg-chrome{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px;}" +
  "#wg-panel .wg-chrome-title{font:700 11px/1.2 system-ui,sans-serif;color:#c9a6ff;" +
  "letter-spacing:.04em;text-transform:uppercase;flex:1;min-width:0;}" +
  "#wg-panel .wg-chrome-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}" +
  "#wg-panel button.wg-hide-btn,#wg-panel button.wg-mini-next{margin:0;padding:4px 10px;font:600 11px system-ui,sans-serif;" +
  "background:#3a2a60;color:#e8dcff;border:1px solid #5b3aa8;border-radius:6px;cursor:pointer;}" +
  "#wg-panel button.wg-hide-btn:hover,#wg-panel button.wg-mini-next:hover{background:#4b2a80;}" +
  "#wg-panel button.wg-mini-next{background:#2a9d6f;border-color:#22855e;color:#fff;display:none;}" +
  "#wg-panel button.wg-mini-next:hover{background:#22855e;}" +
  "#wg-panel button.wg-mini-next:disabled{opacity:.55;cursor:default;}" +
  "#wg-panel.wg-collapsed{width:auto;max-width:92vw;padding:8px 12px;max-height:none;overflow:hidden;}" +
  "#wg-panel.wg-collapsed .wg-body{display:none;}" +
  "#wg-panel.wg-collapsed .wg-chrome{margin:0;}" +
  "#wg-panel.wg-collapsed .wg-chrome-title{font:700 13px/1.25 system-ui,sans-serif;color:#fff;" +
  "letter-spacing:0;text-transform:none;}" +
  "#wg-panel.wg-collapsed button.wg-mini-next.wg-mini-next-show{display:inline-block;}" +
  "@media (max-width:640px){" +
  "#wg-panel{left:8px;right:8px;bottom:8px;transform:none;max-width:none;width:auto;" +
  "max-height:min(55vh,calc(100vh - 16px));padding:12px 14px;border-radius:12px;}" +
  "#wg-panel.wg-collapsed{left:50%;right:auto;transform:translateX(-50%);width:auto;}" +
  "#wg-episodes{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;}" +
  "#wg-panel .wg-narration{font-size:13px;}" +
  "#wg-panel button{width:100%;}" +
  "#wg-panel.wg-collapsed button.wg-mini-next,#wg-panel.wg-collapsed button.wg-hide-btn{width:auto;}" +
  "#wg-panel .wg-error-actions{flex-direction:column;}" +
  "#wg-banner{max-width:min(92vw,320px);font-size:13px;}" +
  "}";


// Purple dot favicon (matches the overlay's own theme color) - the tab-bar
// signal that "this Chromium window is a waygraph run," even at a glance
// across a taskbar/alt-tab, not just something visible inside the page.
export const WAYGRAPH_FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
      "<circle cx='16' cy='16' r='14' fill='#7C3AED'/></svg>",
  );

// Rules that style the HOST page (device stage) - these must stay in the light DOM, outside the overlay's shadow root.
export const HOST_CSS =
  // Video device stage: keep recordVideo size fixed; center a device-sized shell.
  "html.wg-video-device-stage{background:#0b1220 !important;}" +
  "html.wg-video-device-stage body{margin:0 !important;min-height:100vh !important;" +
  "display:flex !important;align-items:center !important;justify-content:center !important;" +
  "background:#0b1220 !important;overflow:hidden !important;}" +
  "#wg-device-shell{flex-shrink:0;overflow:auto;background:#fff;" +
  "border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);" +
  "transform-origin:center center;" +
  /* Force radius clip on all corners (Chrome + transform/scale). */
  "-webkit-mask-image:-webkit-radial-gradient(white,black);" +
  "isolation:isolate;" +
  "transition:border-radius .55s cubic-bezier(.22,1,.36,1),box-shadow .55s ease," +
  "transform .55s cubic-bezier(.22,1,.36,1),width .5s ease,height .5s ease,max-width .5s ease,max-height .5s ease;}" +
  "#wg-device-shell.wg-shell-enter{border-radius:0;box-shadow:none;}" +
  "#wg-device-shell.wg-shell-shutter-out{border-radius:0 !important;" +
  "box-shadow:none !important;outline:none !important;border:none !important;}" +
  "#wg-device-shell.wg-shell-desktop-flat{border-radius:0 !important;box-shadow:none !important;" +
  "outline:none !important;border:none !important;-webkit-mask-image:none;}";
