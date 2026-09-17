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

User / tester asks - craft episodes with checklist todos, reveal off-screen targets, optional zoom, episode on mini stepper.

| Item | Status | Notes |
|------|--------|-------|
| **Todo checklist fixtures** | DONE (0.12.23) | `todos` + `todoIndex` on stubs/fixtures; panel checklist |
| **Auto-scroll into view** | DONE (0.12.23) | Vert + horiz before ring (overflow ancestors too) |
| **Zoom fixtures** | DONE (0.12.23) | `zoom: number` scales target while ring/slide shows |
| **Mini stepper shows episode** | DONE (0.12.23) | Collapsed chrome: `Ep N · step · block` |

### Authoring sketch (todos + zoom)

```ts
stubBefore: {
  plan: {
    selector: "#login-button",
    label: "Sign in plan",
    todoIndex: 0, // 0 = current; before = done; after = pending
    todos: ["Enter email", "Enter password", "Click Sign in"],
    zoom: 1.35, // optional magnify target while this ring is up
  },
}

// Sequential: bump todoIndex (or mark done) in the phase function
stubBefore: (out) => ({
  plan: {
    selector: "#login-button",
    label: "Sign in plan",
    todoIndex: out.__todoStep ?? 1,
    todos: ["Enter email", "Enter password", "Click Sign in"],
  },
})

withHighlightFixtures(ep2, {
  "submit-login": {
    stubBefore: {
      plan: { label: "AC checklist", todoIndex: 1, todos: ["Email", "Password", "Submit"] },
    },
  },
});
```

## Later / nice-to-have

- Phase C leftover: glob `--blocks` on `demo`/`run`
- Traverse work-stealing / FF bootstrap / FF covered-via-prefix (see Parked next)
