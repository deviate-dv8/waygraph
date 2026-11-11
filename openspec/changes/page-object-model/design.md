## Decisions
### D1. The page is passed to its own `do` and `expects`
A function of the page, called once after construction, instead of a thunk per entry: types come from what the function returns (autocomplete stays), and a Method file imports its page's *type* only. The lifecycle guide ("How a run works") fixes when each part runs.
### D2. One check concept
Trait is the check; `verify` (the Block's own) and `expect` (the scenario's) are two places for Traits. A read field becomes a Trait with `.is/.passes`; a named expectation is an `expects` entry. Expect Blocks go (a multi-field or mem-using check is a function entry).
### D3. Read failures
A field read that throws reads as absent with the error in the run log; it never fails a step. A page's read is a snapshot after the page settles; expectations retry (as verify does).
### D4. Address from the folder
`waygraph map` already ties folders to addresses; the Nav is derived, and a `[id]` segment is a typed param. Pages in a freeform layout give `url` themselves.
### D5. Interrupts reuse Playwright's `addLocatorHandler`
Installed per page by the covering layouts; each firing emits a run event; the demo shows it.
### D6. Staging
Stage 1 ships alone; stage 2 needs the Map's folders; stage 3 is independent; stage 4 last (every Block changes). Each stage's codemod runs `--dry` first, `waygraph check` lists what's left.
## Risks
- A large migration → staged, codemods, a deprecated-page section per stage.
- Type cycles in a self-referencing page → type tests first (a `page-object.types.ts`) before stage 1 lands.
