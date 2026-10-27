# Environment variables

Every `WAYGRAPH_*` variable waygraph reads. Most are set for you from flags and `config/waygraph.config.ts`; a flag
beats the variable, which beats the config file. On / off variables take `1` / `true` / `yes` / `on` or `0` /
`false` / `no` / `off`.

This page is generated from `src/engine/env.ts` (`npm run docs:api`).

| Variable | Meaning |
| --- | --- |
| `WAYGRAPH_BASE_URL` | Base URL for relative gotos (--base-url, the config's baseUrl) |
| `WAYGRAPH_CONFIG` | Which config file to load (--config &lt;name\|file&gt;) |
| `WAYGRAPH_ENV` | Env mode: loads .env.&lt;mode&gt; on top of .env (--env) |
| `WAYGRAPH_COMMAND` | The command running (run / demo / test), so the config's per-command section applies |
| `WAYGRAPH_PROJECT_DIR` | The project waygraph test runs Playwright for |
| `WAYGRAPH_HEADED` | 1 shows the browser, 0 hides it (--non-headless; demo default 1) |
| `WAYGRAPH_STEP` | 1 plays steps through the demo stepper (demo, run --step) |
| `WAYGRAPH_JSON` | 1 prints a JSON report instead of the demo log |
| `WAYGRAPH_ALL_BRANCHES` | 1 explores every branch() path (--all-branches) |
| `WAYGRAPH_SHARED_SESSION` | 1 keeps one session across branches (--shared-session) |
| `WAYGRAPH_TITLE` | Demo banner title (--title) |
| `WAYGRAPH_TITLE_POS` | Demo banner position: left \| center \| right |
| `WAYGRAPH_DATA` | Mem seed JSON (--data) |
| `WAYGRAPH_AUTO_MEM` | Mem seed JSON for auto sessions (same as WAYGRAPH_DATA) |
| `WAYGRAPH_MEM_STUB` | 1 fills missing requires from registerMemStub (--mem-stub) |
| `WAYGRAPH_REPLAY` | A run id: seed mem with what that run recorded (--replay) |
| `WAYGRAPH_AUTOPLAY` | 1 advances demo steps on their own (--auto-next) |
| `WAYGRAPH_AUTOPLAY_MS` | Auto-next wait per step, ms (default 1800) |
| `WAYGRAPH_DEMO_FAST` | 1 shortens the demo's gates (--fast) |
| `WAYGRAPH_DEMO_PACE` | Default pace for every demo step (the config's demo.pace) |
| `WAYGRAPH_PACE_SPEEDS` | JSON of pace multipliers, e.g. {"fast":0.5} |
| `WAYGRAPH_FAST_BLOCKS` | Comma-separated Block names that skip the demo's added dwell |
| `WAYGRAPH_SLOWMO` | Playwright slowMo / the demo's beat after each action, ms |
| `WAYGRAPH_TYPING_MS` | Demo typing delay per character, ms (default 30) |
| `WAYGRAPH_APPEARANCE` | The overlay's appearance: light \| dark (default: the system's) |
| `WAYGRAPH_SWIPE_MS` | Demo swipe gesture duration, ms (default 650) |
| `WAYGRAPH_DEVICE_TRANSITION_MS` | Demo device resize animation, ms (default 520) |
| `WAYGRAPH_STEPPER` | full shows every step chip (--full); default carousel |
| `WAYGRAPH_MINI` | 1 forces the compact stepper panel (--mini) |
| `WAYGRAPH_TODO_POS` | Todo dock side: left \| right (--todo-left / --todo-right) |
| `WAYGRAPH_TODO_UI` | full turns off the todo dock's compact / collision / behind-ring (--todo-full) |
| `WAYGRAPH_TODO_COLLISION` | 0 turns off the todo dock moving away from a ring |
| `WAYGRAPH_TODO_BEHIND` | 0 turns off dimming the todo dock behind a ring |
| `WAYGRAPH_TODO_COMPACT` | 0 turns off folding long todo lists |
| `WAYGRAPH_TODO_CAP` | Rows a folded todo list shows (default 5) |
| `WAYGRAPH_TODO_EXPAND_CAP` | Rows a hovered todo list shows (default 14) |
| `WAYGRAPH_FF_EXPAND` | 1 plays fast-forward units step by step (--ff-expand) |
| `WAYGRAPH_FF_DISABLED` | 1 expands fast-forward units and keeps their blitz pace (--ff-disabled) |
| `WAYGRAPH_CLEAR_SESSION` | 1 clears the session before every step after the first |
| `WAYGRAPH_VIDEO` | Record a video: the folder, or 1 for the default (--video) |
| `WAYGRAPH_VIDEO_DIR` | Default video folder |
| `WAYGRAPH_VIDEO_VIEWPORT` | Recording size, e.g. 1920x1080 (--video-viewport) |
| `WAYGRAPH_RUN_LOG` | Run log: 0 turns it off, or a folder (the config's runLog) |
| `WAYGRAPH_EXTENSIONS` | Unpacked browser extension folders, path-separated (overrides the config's extensions) |
| `WAYGRAPH_CACHE_DIR` | Where downloaded extensions are cached |
| `WAYGRAPH_PROVE_SHOT` | Demo self-check: screenshot path for the overlay proof |
| `WAYGRAPH_PROVE_EXIT` | 1 exits after the first overlay proof (demo self-check) |
| `WAYGRAPH_PROVE_EVERY` | 1 proves the overlay on every step, not only the first |
