# waygraph objectives (living)

ASCII only. Last updated: 2026-09-17.

Parked / in-flight goals so overrides do not lose the main track.

## RFC: Traverse + FFCompose (`docs/proposals/traverse-ffcompose-rfc.md`)

| Phase | Status | Notes |
|-------|--------|-------|
| **A** FFCompose + blitz + `--ff-disabled` | DONE (0.12.13) | Opaque blitz; dispute expand |
| **B** `waygraph traverse` serial | DONE (0.12.8+) | max-visits, leaf/fail lines |
| **C** `--blocks` glob/regex select | DONE (0.12.10+) | auto + traverse |
| **D** `--parallel` + `--session clone` + leases | DONE (0.12.14) | inherit refused if parallel>1 |
| **E** Coverage JSON + `--min-edge-coverage` CI | DONE (0.12.20) | Suite gate exit 2; instance hits cover parent block |

### Parked next (after fixtures track)

- Phase C leftover: glob `--blocks` on `demo`/`run` flow resolve
- FF bootstrap seed for parallel (`--ff` before fork)
- Traverse work-stealing when partition soft-leafs
- FF covered-via-prefix in coverage reports (RFC open Q3)

## Richer testing / demo (DONE - 2026-09-17)

| Item | Status |
|------|--------|
| Gray automation + iconified tones + size/weight | DONE |
| Flow episode style / pace / numeric pace / speaks in UI | DONE (0.12.18) |

## Fixture / stepper requests (NOW - 2026-09-17)

Open **block lifecycle** stubs (not closed slot objects). Episode fixtures
(todos / zoom) are set inside `stubBefore(ctx)` / `stubAfter(ctx)`.

| Item | Status | Notes |
|------|--------|-------|
| **Open stub lifecycle** | DONE (0.12.24) | `stubBefore(ctx) { ctx.todos(...); ctx.ring(...) }` |
| **Todo checklist fixtures** | DONE (0.12.24) | `ctx.todos` + `ctx.todoIndex` (bump for sequential plans) |
| **Auto-scroll into view** | DONE (0.12.25) | Smooth vert + horiz (incl. overflow ancestors); wait scrollend before ring |
| **Camera zoom (Screen Studio)** | PARTIAL (0.12.40) | Auto-center + `zoomOut:false` OK for first/center targets; **corners/edges still bad** - parked |
| **Camera follow mouse** | PARKED | Host follow imperfect; first zoom fine, corners fail. See `tasks/backlog/2026-09-18_waygraph-camera-follow-corners.md` |
| **Banner title in lifecycle** | DONE (0.12.28) | `ctx.title(...)` / `ctx.banner(...)` updates top `#wg-banner` |
| **Highlight queue** | DONE (0.12.28) | Appear -> dwell -> fade; live follow; focus veil; caption color; `[i/n]` |
| **Mini stepper shows episode** | DONE (0.12.23) | Collapsed chrome: `Ep N · step · block` |

### Authoring (what it is)

```ts
stubBefore: (ctx) => {
  ctx.title("Signing in"); // top banner text (tag stays "waygraph demo")
  ctx.todos(["Enter email", "Enter password", "Click Sign in"]);
  ctx.todoIndex(0);
  ctx.zoom(1.35); // Screen Studio camera - auto-center on target (follow-mouse parked)
  ctx.highlights({
    email: { selector: "#email", label: "Email", focus: true, color: "#c9a6ff" },
    submit: { selector: "#login-button", label: "Sign in", zoom: 1.5 },
  });
},

stubAfter: (ctx) => {
  ctx.banner("Inventory");
  ctx.todos(["Enter email", "Enter password", "Click Sign in"]);
  ctx.todoIndex(2);
  ctx.ring("inv", { selector: ".inventory_list", label: "Landed", focus: true });
},
```

Object map `{ email: { selector, label } }` remains a **highlight-only shorthand**.
Flow `withHighlightFixtures` still patches ring labels/tags per slot.

## Later / nice-to-have

- Phase C leftover: glob `--blocks` on `demo`/`run`
- Traverse work-stealing / FF bootstrap / FF covered-via-prefix (see Parked next)
