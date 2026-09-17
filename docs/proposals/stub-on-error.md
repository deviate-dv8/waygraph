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

- Success path: `stubAfter` only (unless `withExpectedFailure` - see below).
- Fail path: `stubOnError` rings (~2s default dwell when duration unset), then error panel.
- `withExpectedFailure`: runs `stubOnError` + amber panel when the last step **throws**,
  **or** when it **succeeds** on the intentional fail branch (e.g. LoginPage + banner
  after branched submit-login). Headless `run()` still returns the checkpoint.
- No `runGraph` / CI behaviour change.

## Acceptance

1. Demo step intentional verify fail → ≥1 `stubOnError` ring before error panel.
2. `withExpectedFailure` branched success (LoginPage) → stubOnError + amber panel on last step.
3. `withHighlightFixtures` overrides `stubOnError` labels.
4. Success path unchanged for normal flows.
5. Unit: `tests/core/stub-on-error.spec.ts`.
