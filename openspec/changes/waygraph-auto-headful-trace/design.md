## Context

Phases 1-2 (`waygraph-auto-cli-session-control`, `waygraph-auto-dom-inspect`) shipped
`AutoSession` (`src/auto-session.ts`) and its request/response server
(`src/auto-session-ipc.ts`), both hardcoded to `headless: true` since they were built for the
detached/RPC use case only. This change adds an optional visible-browser mode and a
Checkpoint/Block-level trace, both additive to that existing session, not a redesign.

Checked before writing this spec, per this session's own precedent (verify assumptions
against real code, e.g. Phase 2's `page.accessibility.snapshot()` correction): `src/cli.ts`
already has `RunFlags.nonHeadless`, parsed by `parseRunFlags` (which `auto`'s own case already
calls) and used by `run`/`demo` for exactly "show the browser." Reusing it for `auto --detach`
avoids a second flag name meaning the same thing.

## Roadmap (why this slice, not the whole vision)

1. **This change** - `--non-headless` on `--detach`, and the `trace` op/sub-verb.
2. **Not in this change** - agent-skill hardening (`defineAssertBlock`, `*Sel` enforcement,
   orphan-Block self-gate), and specifically anything that *consumes* the trace to actually
   author Block files (Phase 4).
3. **Not in this change** - the `maildrop.cc` external-mail adapter (Phase 5).
4. **Not in this change** - Waygraph Copilot itself (Phase 6).

## Goals / Non-Goals

**Goals:**
- A session can run with a real visible browser while staying fully agent-drivable through
  the same RPC surface - no new picker, no forked state.
- The trace is a Checkpoint/Block-level record (what actually happened, at the same
  resolution the rest of the engine already reasons about), never a raw action log - this is
  the literal differentiator from Playwright codegen this roadmap has been framing since
  Phase 0's evidence-gathering.
- Zero behavior change to Phase 1/2's ops, to the existing page-embedded headful panel, or to
  default (headless, no trace queried) session behavior.

**Non-Goals (this change):**
- Anything from Phase 4 onward, in particular generating or authoring Block files from a
  trace - that is separate, later work this change deliberately does not anticipate the shape
  of.
- Persisting a trace across a session's own lifetime (it lives in memory for that session
  only, gone when the session quits) - a durable trace store is a real possible future need,
  not scoped here.
- Recording DOM evidence per trace step automatically - an agent that wants that can already
  call `dom` itself at whatever points matter, reusing Phase 2; auto-attaching a DOM snapshot
  to every trace step by default would bloat the trace for sessions that don't need it.

## Decisions

**Reuse `--non-headless`, don't invent `--headful`.** Confirmed in `src/cli.ts`:
`RunFlags.nonHeadless` already means exactly this ("show the browser") for `run`/`demo`, and
`auto`'s own case already calls `parseRunFlags`, so the flag is available with zero parser
changes - only the `--detach` branch needs to read it. A second flag name for the same
concept would be a needless inconsistency.

**A visible browser in a detached process depends on a real display being available to
inherit.** `spawnDetachedSession`'s `child_process.spawn` call does not override `env`, so it
already inherits the parent's full environment (including `DISPLAY` on Linux) - no new
plumbing needed for that. This is the same real-world constraint `--non-headless` already has
for `run`/`demo` today (it does not work in a display-less CI environment either); not a new
risk this change introduces.

**Trace steps are capped in memory, matching Phase 2's "never unbounded" precedent for an
LLM-facing surface.** An agent-driven session could run for a long, exploratory session with
many picks; an unbounded in-memory trace is a real (if slow) leak. Capped at the last 500
steps (oldest dropped first) - generous for realistic agent-authoring sessions, bounded for a
pathological one. Not exposed as a tunable in this first cut, matching Phase 2's own "recipe
before promotion" reasoning for not exposing every cap as a flag immediately.

**A trace step records the Checkpoint before/after plus resolved demo-narration fixtures,
but never a DOM snapshot.** Revised after checking prior art directly requested this session:
`waygraph demo`'s own lifecycle logging (0.13.5, `demoLog`/`runStubPhase` in
`src/cli.ts`/`src/highlights.ts`) already computes rich, semantically-labeled step data
(highlights, todos, device state) from a Block's own authored `stubBefore`/`stubAfter`/
`stubOnError` - but only inside the `demo`/`chain --step` code path, never from `runGraph`
directly, so `AutoSession` never saw it. `runStubPhase(block, phase, opts)` takes no `page`
argument and has zero browser side effects - it purely resolves the author's stub callback
against a data-only context - so it is safe and cheap to call from `AutoSession.applyPick`
too. Each trace step now calls `runStubPhase` for `stubBefore` (before running), and
`stubAfter`/`stubOnError` (after, depending on outcome), attaching the result only when it
actually carries content (`stubPhaseHasContent`) so a Block with no stubs authored does not
bloat the trace with empty objects. A DOM snapshot is still deliberately excluded - that
remains Phase 2's `dom` op, called by the agent itself when it specifically wants that.

**Invalid picks and quit do not produce trace steps.** The trace exists to record what the
*session actually did to the target app* - an out-of-range pick never ran anything, and quit
is session lifecycle, not a Block execution. Recording either would make the trace a log of
RPC calls rather than a log of the session's actual work, which is the wrong resolution for
"what a later authoring step should read."

## Risks / Trade-offs

- [A visible detached browser window has no obvious owner once the terminal that started it
  is gone - an operator could be surprised to see it appear] -> Same accepted shape as
  `--detach` itself already has (Phase 1's own design.md): opt-in, and `send q`/`quit` is the
  documented way to end it, same as any other intentionally-backgrounded process.
- [A 500-step cap could silently drop early trace history for a very long session] -> Oldest
  steps drop first, not newest, so the most recent (usually most relevant) history is always
  intact; revisit only if a real case needs more, not speculatively.
- [Scope creep toward Phase 4's trace-to-Block authoring while implementing this] -> Mitigated
  by this design doc's explicit Non-Goals; this change stops at exposing the trace as data.
