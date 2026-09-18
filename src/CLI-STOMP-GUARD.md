# Do not revert Hide / mini stepper in `cli.ts`

Owned by Dan's waygraph camera/stepper seat (2026-09-18).

**Hard rules (0.12.42+):**

1. Never pass `forceCollapsed: false` - omit or `true` only.
2. Hide preference = `localStorage['wg-panel-hidden']` - honor across steps.
3. Collapsed mini chrome must show **Next** when not auto-advance (`wg-mini-next`).
4. CLI flag: `--mini` / `--stepper-mini` -> `WAYGRAPH_MINI=1` (compat: `WAYGRAPH_STEPPER_MINI`).
5. Todos live in `#wg-todo-dock` (outside `#wg-panel`) so `--mini` / Hide never hide them.
   Authors: `ctx.todoPos("left"|"right")`; also click dock / `--todo-left|--todo-right` /
   `WAYGRAPH_TODO_POS`.
6. Banner text: `ctx.title(...)` / `ctx.banner(...)` must update `#wg-banner .wg-banner-text`
   every step (installOverlay creates once, then updates). Episode tab label = `withTitle(flow, ...)`.
7. Ring/label tone CSS: `transition:opacity` only — never border-color/background morph.
8. **Blind-agent beacons (anti-blank):** every modal root (`#wg-panel`, `#wg-banner`,
   `#wg-todo-dock`, `#wg-auto-panel`) must stamp `data-wg-ui` / `data-wg-modal` / `data-wg-ready="1"` via
   `window.__wgStampModal`. Agents must not claim the stepper works unless
   `assertWgOverlayReady(page)` or `WAYGRAPH_PROVE_EXIT=1` passes (see
   `src/overlay-beacon.ts`, `tests/cli/overlay-beacon.spec.ts`).

If you are another agent: do **not** rewrite `__wgWirePanelChrome` or yap `remove("wg-collapsed")` without Dan saying so.
Do **not** put `#wg-todos` back inside `.wg-body` (mini collapse hides it).
Do **not** strip beacon stamps or weaken `assertWgOverlayReady` / `WAYGRAPH_PROVE_EXIT`.
