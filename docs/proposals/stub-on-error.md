# RFC: `stubOnError` — DOM highlights when a demo step fails

**Status:** shipped in waygraph **0.12.4+**  
**Origin:** PIA `pia-waygraph` issue-test handoff (2026-09-17)

## Ask (done)

When a **demo step** throws (failed verify trait, `act()` error), run optional
**`stubOnError`** highlight rings — same merge as `stubBefore` / `stubAfter` —
**before** `renderStepError`, so QA points at the broken UI, not only the panel.

## API

```typescript
instruction: {
  stubBefore: { /* … */ },
  stubAfter:  { /* … */ },
  stubOnError: {
    card: { selector: 'button:has-text("Select")', label: "Card at failure", duration: true },
  },
}

withHighlightFixtures(flow, {
  "method-…": {
    stubOnError: {
      card: { label: "BUG · premature badge", detail: "…", tag: "FAIL" },
    },
  },
});
```

- Success path: `stubAfter` only (unchanged).
- Fail path: `stubOnError` rings (~2s default dwell when duration unset), then error panel.
- `withExpectedFailure`: still runs `stubOnError` when the step throws.
- No `runGraph` / CI behaviour change.

## Acceptance

1. Demo step intentional verify fail → ≥1 `stubOnError` ring before error panel.
2. `withHighlightFixtures` overrides `stubOnError` labels.
3. Success path unchanged.
4. Unit: `tests/core/stub-on-error.spec.ts`.
