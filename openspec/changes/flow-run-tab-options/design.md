## Context

Discovered while proving a live 2-tab demo against the real zsign stack
(`projects_waygraph/zsign-all`): package register -> spawned MailHog tab clicks the real
verify link -> `target=_blank` popup lands on `/dashboard`. Dan ratified the gaps and had
the demo author (mini-6) forum them with slot-6 (the original waygraph framework dev).
slot-6 reviewed all four against the source, greenlit, and scoped this change.

Verified facts from the real source (not the writeup): `runGraph` does
`const page = await context.newPage();` then closes in `finally`; `spawnTab` reads
`page.context()` and passes it to `runGraph`; there is no popup tracking; there was no
`closeOnFinish` knob.

## Goals / Non-Goals

**Goals:**
- A flow can drive an already-open page (`options.page`).
- A flow can decide whether its page survives the run (`options.closeOnFinish`), and when
  it explicitly asks `false`, gets the page handle back in the return value.
- Fully additive: every pre-existing call site keeps compiling and behaving identically.
- Popup capture documented as a recipe (the fix-in-userland-first principle, as used for
  the action-block idea and `defineBeat`), not promoted to engine API yet.

**Non-Goals:**
- A generic `TabHandle` abstraction / popup tracker in the engine. slot-6: "don't invent a
  generic 'TabHandle' abstraction yet - write the popup-capture pattern as a documented
  recipe first... only promote to engine API if a second real use case needs it too."
- New tabs from inside a single run (that's `spawnTab`, unchanged).
- Reshaping existing positional args of `runGraph` or `spawnTab(entry, page, mem)`.

## Decisions

**Options are a trailing optional `options` object, not new positional args.**
`Flow.run` has ~20 real call sites across `zsign-all` + `saucedemo` specs. A trailing
optional object is additive - old calls typecheck and behave byte-for-byte the same.
Rejected: adding `closeOnFinish?: boolean` as a positional arg (shifts every existing call,
breaks compile) and a `RunOptions`-first signature (inversion for zero benefit).

**`options.page` means "run on this page; it's yours".** When the caller passes a `page`,
the run must not default to closing it - a page you opened is yours to close. Only the
no-`page` case (the run opened the page itself) defaults `closeOnFinish` to `true`, which
is exactly what every pre-existing `run(context, mem)` call already did. An explicit
`closeOnFinish` always wins. `runGraph` itself has no page-aware default - its caller
already decided `page` and `closeOnFinish` together.

**The `{ result, page }` return shape is typed on the literal `false`, not the computed
default.** A caller who passes `{ page }` and leaves `closeOnFinish` unset already holds
the page reference; handing it back again in a different return shape would silently break
the plain-`Out` overload their call actually matched at the type level. Only an explicit
`closeOnFinish: false` returns `{ result, page }`, typed via the `RunGraphOptions & {
closeOnFinish: false }` overload - a literal `false`, not a `boolean`.

**Attempt-once page-open, not retry loop.** `Flow.run` opens (or reuses) the page itself,
before calling `runGraph`, so the method - not `runGraph` - decides close-on-finish and
the page handle survives past `runGraph`'s own return. `runGraph` receives
`closeOnFinish: false` internally and owns only the step-by-step graph drive.

**Popup capture is a documented recipe, not a `TabHandle` abstraction.** #3 is the one gap
needing real design, not plumbing. The recipe: arm `context.once('page', handler)` before
the click expected to open one popup, store the captured `Page` in a caller-owned variable,
and let the recipe function close it or hand it off. This mirrors how the action-block idea
and `defineBeat` were resolved: document the pattern first, promote to engine API only when
a second real use case needs it. `spawnTab(entry, page, mem)` is unchanged - "your actual
pain was 'the entry/outer flow can't reuse an open page', not spawnTab" (slot-6).

## Risks / Trade-offs

- [Caller passes `{ page }` and expects a `{ result, page }` back; they only get the page
  again if they also pass `closeOnFinish: false`] -> Mitigated by typed overloads and the
  JSDoc on both `run` overloads; the caller already holds the page reference, so the
  double-return is redundant, not missing, in that case (design note above).
- [Adding an options arg invites future ternary bloat on `run`] -> Mitigated: `run` stays
  a thin 3-overload surface; any new option requires a concrete userland pain first, same
  as popup capture.
- [Docs recipe vs engine feature - popup capture may get re-requested] -> Intentional:
  promotes to engine API only on a second real use case (slot-6's explicit condition).
- [Two Playwright installs across `services/waygraph` and `projects_waygraph/zsign-all`
  caused a 100% import failure] -> Already resolved separately (child-process delegation,
  absolute-path tsx/ESM resolution, symlink-following o/npm link); waygraph is now
  npm-linked globally so `npx waygraph` works verbatim. Not part of this change.