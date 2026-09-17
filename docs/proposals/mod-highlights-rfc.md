# RFC: `stubBefore` + `stubAfter` + flow fixtures (blocks-driven demo narration)

**Status:** proposal  
**Requested from:** PIA `pia-waygraph` issue-test  
**Waygraph today:** `0.10.9` — ad-hoc `instruction.highlights`, fill patch (`"from mem: …"` /
`"writing"`), verify-trait fallback (`visible(#email)`). No flow override path.

---

## Problem

Demo narration is split across three inconsistent mechanisms:

| Mechanism | When | Label source |
|-----------|------|--------------|
| Fill/click patch | During `act` | `"from mem: login-email"`, `"writing"`, button text |
| `instruction.highlights` | After step | Author `label` (saucedemo — rich) |
| Verify fallback | After step | Trait name `visible(#email)` (ugly) |

Blocks-driven projects need **one lifecycle on every block**, overridable from the flow file
(like Mem `requires` + `Mem JSON:`).

---

## One feature — block stubs + flow fixtures

| Half | Where | Role |
|------|--------|------|
| **Stubs** | Every block `instruction` | `stubBefore` + `stubAfter` — named slots (selector + neutral label). Catch-all lifecycle on every block (`{}` ok). |
| **Fixtures** | Flow `.flow.ts` | **Unlimited demo purposes** — AC copy, BUG/GATE tags, `detail`, ticket sentences, per-issue captions. Override per block / phase / slot. |

**Why flow.ts matters:** shared blocks stay library-neutral (selectors + generic labels only).
The issue flow is the surface with unlimited purposes for demo highlights — same idea as
`requires` on the block + `Mem JSON:` / mem seed on the flow. Fixtures merge onto stub slots;
they do not invent selectors the block never declared (optional selector inherit).

**Not** `modHighlight` / not a `modBlock*` catch-all decorator. Filename `mod-highlights` is
legacy naming only. No ticket sentences in shared block files.

---

## Block lifecycle (required on all blocks)

**Every block** declares both phases. Empty `{}` is valid (nav-only, pure gate) but the
shape is always present — same as `verify: []` or `requires: []`.

```typescript
export const submitMagicLink = defineMethodBlock({
  name: "method-pia-login-submit-magic-link",
  instruction: {
    async act(page, _input, mem) {
      await page.locator("#email").fill(mem.get(LoginEmail));
      await page.getByRole("button", { name: "Send sign-in link" }).click();
    },
    resolve: () => checkpoint("PiaLoginLinkSent"),
    verify: [Trait.visible("text=Check your inbox")],

    // REQUIRED shape on every block (may be {})
    stubBefore: {
      email: {
        selector: "#email",
        label: "Email address",
      },
      submit: {
        selector: 'button[type="submit"]',
        label: "Send sign-in link",
      },
    },
    stubAfter: {
      sent: {
        selector: "text=Check your inbox",
        label: "Magic link sent",
      },
    },
  },
});
```

```typescript
// Nav block — stubBefore often empty; stubAfter = arrival target
export const navPiaLogin = defineNavBlock({
  name: "nav-pia-login",
  checkpoint: "PiaLogin",
  url: "/login",
  verify: [Trait.url({ pathname: "/login" })],
  stubBefore: {},
  stubAfter: {
    form: { selector: "#email", label: "Login form" },
  },
});
```

### Phase semantics

| Phase | When demo engine runs it | Replaces |
|-------|--------------------------|----------|
| **`stubBefore`** | Before / during `act` — cycle rings on targets about to be used; fill/click patch reads merged label for matching selector | `"writing"`, raw mem-key ring text |
| **`stubAfter`** | After resolve + verify — cycle rings while step panel shows (today's `renderAfterStep`) | `instruction.highlights`, verify-trait fallback |

Multiple slots per phase cycle in order (same as current multi-highlight behavior).

---

## Flow lifecycle — fixtures override stubs

Issue flows attach fixtures keyed by **block.name → phase → slot**:

```typescript
/**
 * Mem JSON: {"login-email":"marco@jbtec.example",…}
 * Highlight fixtures: {…}   ← optional header line for issue-test.sh
 */

const highlightFixtures = {
  "method-pia-login-submit-magic-link": {
    stubBefore: {
      email: {
        label: "pia-pm#276 · Marco's work email",
        detail: "Magic link — check Mailpit next.",
      },
    },
    stubAfter: {
      sent: { label: "Link sent", tag: "GATE" },
    },
  },
  "method-pia-select-recommended-alternative": {
    stubBefore: {
      select: {
        label: "pia-pm#276 AC-3 · Select Alternative 1",
        detail: "Opens commit dialog — must not badge Active Plan yet.",
        tag: "BUG",
      },
    },
    stubAfter: {
      dialog: {
        label: "Commit dialog open",
        detail: "Card unchanged — no Active Plan badge.",
      },
      card: {
        label: "Alternative 1 card",
        detail: "Button still reads Select Alternative 1.",
      },
    },
  },
} as const;

export const issue276SelectCancelFlow = withHighlightFixtures(
  withTitle(withSessionReset(engine.defineFlow([start, ...chain, end])), "pia-pm#276 …"),
  highlightFixtures,
);
```

### Merge rule

```typescript
function resolveStub(
  block: Block,
  phase: "stubBefore" | "stubAfter",
  slotId: string,
  fixtures: HighlightFixtureMap,
): WaygraphHighlightResolved | null {
  const base = block.instruction[phase]?.[slotId];
  if (!base) return null;
  const patch = fixtures[block.name]?.[phase]?.[slotId] ?? {};
  return { ...base, ...patch }; // fixture may omit selector; inherit from block
}
```

Missing fixture → block stub default. Unknown fixture slot → ignore (optional warn in `waygraph check`).

---

## Types

```typescript
export interface WaygraphHighlightStub {
  selector: string;
  label: string;
  detail?: string;
  tag?: string;
}

/** Fixture patches label/detail/tag; selector optional (inherit from block). */
export type WaygraphHighlightFixture = Partial<Pick<WaygraphHighlightStub, "selector">> &
  Required<Pick<WaygraphHighlightStub, "label">> &
  Pick<WaygraphHighlightStub, "detail" | "tag">;

export type HighlightStubPhase = Record<string, WaygraphHighlightStub>;

export interface BlockHighlightStubs {
  stubBefore: HighlightStubPhase;
  stubAfter: HighlightStubPhase;
}

export type HighlightFixtureMap = Record<
  string, // block.name
  {
    stubBefore?: Record<string, WaygraphHighlightFixture>;
    stubAfter?: Record<string, WaygraphHighlightFixture>;
  }
>;
```

Add to `Instruction`:

```typescript
stubBefore: HighlightStubPhase;  // required; {} allowed
stubAfter: HighlightStubPhase;   // required; {} allowed
```

Function form (branching blocks): `stubAfter: (out) => ({ sent: { … } })` — same as `verify`.

---

## Demo engine changes

1. **`waygraph check`**: warn when a block lacks `stubBefore` / `stubAfter` (migration period:
   default missing → `{}` + deprecation notice for bare `highlights`).
2. **Before act**: resolve `stubBefore` slots; show rings (optional brief dwell); during
   `fill`/`click`, if target matches a `stubBefore` selector, use merged `label` (+ `detail`
   in ring UI) instead of `"from mem: …"` / `"writing"`.
3. **After step**: resolve `stubAfter` only — **never** verify-trait fallback when
   `stubAfter` is non-empty; migrate existing `instruction.highlights` → `stubAfter`.
4. **Ring UI**: render `label` + optional `detail` + `tag`; drop `white-space: nowrap` when
   `detail` present.

---

## Migration from 0.10.9

| Old | New |
|-----|-----|
| `instruction.highlights: [...]` | `stubAfter: { slot: { selector, label } }` |
| (nothing) during fill | `stubBefore` on inputs/buttons the block touches |
| verify fallback rings | `stubAfter` slots (explicit selectors, human labels) |
| `"from mem: login-email"` | `stubBefore.email.label` (+ fixture override) |

Shim (one release): if `stubAfter` empty and `highlights` present, treat `highlights` as
ephemeral `stubAfter` auto-keys (`"0"`, `"1"`, …).

---

## PIA conventions

- **All blocks** in `pia-waygraph/src/blocks/` get `stubBefore` + `stubAfter` ( `{}` ok ).
- **Issue flows** own AC copy in `highlightFixtures` / header `Highlight fixtures:` line.
- **`issue-test.sh`**: parse `Highlight fixtures:` like `Mem JSON:` (optional if flow uses
  `withHighlightFixtures` in code).

---

## Acceptance criteria (waygraph)

1. `Instruction.stubBefore` + `Instruction.stubAfter` required on every block type
   (`defineBlock`, `defineMethodBlock`, `defineNavBlock`, `defineEffectBlock`).
2. `withHighlightFixtures(flow, map)` (+ optional mem key) for flow attachment.
3. Demo merges stub + fixture per phase/slot; rich ring UI (`detail`, `tag`).
4. Fill/click patch prefers `stubBefore` label over mem-key / `"writing"`.
5. No verify-trait fallback when `stubAfter` has any slot.
6. Saucedemo migrated: login fill uses `stubBefore`, cart uses `stubAfter`.
7. Docs + `waygraph check` enforcement.

---

## Non-goals

- `modHighlight()` chain decorators.
- Highlights affecting pass/fail.
- Flow slots with no block stub (stays blocks-driven).

---

**Point maintainers here:** `docs/proposals/mod-highlights-rfc.md`
