## Context

Pure restructuring - see proposal.md for the full file-move list. No new architecture,
dependency, or ambiguity; this section exists only to satisfy the workflow's artifact
graph, not because there's a real decision to document.

## Goals / Non-Goals

**Goals:** `packages/core/` builds, typechecks, and tests exactly as `src/`/`tests/`/
`type-tests/` did before the move - same passing assertions, just relocated.

**Non-Goals:** No behavior change, no new package beyond `@waygraph/core`, no publishing
to a registry.

## Decisions

Flatten `src/core/*.ts` to `packages/core/src/*.ts` rather than keeping a `core/`
subfolder inside the `core` package - the package boundary already says "core", nesting
it again inside itself is redundant.

## Risks / Trade-offs

[Import paths inside every moved file need updating] → Mitigated by running
`tsc --noEmit` and the full test suite after the move, before considering any task done.
