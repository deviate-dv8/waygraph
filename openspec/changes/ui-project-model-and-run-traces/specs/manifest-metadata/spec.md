## ADDED Requirements

### Requirement: Everything in the manifest says where it is defined
The manifest (`version: 3`) SHALL give every Block, Read Block and flow a `source: { file, line, column }`, the position
of its definition (`defineMethodBlock(...)`, the exported flow). Each flow step SHALL carry the `source` of its call in the
chain (`.method(...)`, `.gotoPage(...)`).

#### Scenario: A Block points at its definition
- **WHEN** `SubmitLoginBlock` is defined on line 12 of `src/map/login/_methods/submit-login.method.block.ts`
- **THEN** its manifest entry SHALL have `source: { file: "src/map/login/_methods/submit-login.method.block.ts", line: 12, ... }`

### Requirement: A Block's checks are data
Each Block SHALL list its `verify` and `precondition` Traits as `{ name, wants, selector? }`. When `verify` is a function of
the outcome, the Block SHALL list `verify: "dynamic"` and, if the Block declares its outcomes, the Traits for each outcome
it can evaluate without a page. Each Block's `expect` SHALL list the Expect Blocks by name and the Traits and read checks
by `{ name, wants }`, per outcome for a branching Block. An Expect Block SHALL list its own Traits the same way.

#### Scenario: A Method's verify is listed
- **WHEN** a Method has `verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible("#cart")]`
- **THEN** its manifest entry SHALL list two checks, each with its name and what it wants, the second with selector `#cart`

### Requirement: Selectors are listed and linked
The manifest SHALL list every selector object a project exports (`export const LoginSel = { ... } as const` in a
`*_sel.ts` file) with each member's name, selector string (or `"function"` for a member that builds one) and line. Each
Block SHALL list the selector members its definition references (`LoginSel.username`), found by reading its source, not by
running it.

#### Scenario: A Block's selectors come from its source
- **WHEN** a Method's `act` calls `page.locator(LoginSel.username).fill(...)` and `page.locator(LoginSel.submit).click()`
- **THEN** its manifest entry SHALL list `LoginSel.username` and `LoginSel.submit`, and the manifest's selector list SHALL
  give their selector strings

### Requirement: Flow steps carry their details
Each flow step SHALL carry its Block name, its `source`, its expectations (as today), whether it has narration
(`stubBefore`, `stubAfter`, `stubOnError`), and its options when set (`when`, `ff`, `finally`, `expect: false`).

#### Scenario: A narrated step says so
- **WHEN** a flow's first step is `NavLoginBlock.stubBefore((ctx) => ctx.ui.title("Login"))`
- **THEN** that step SHALL have `narration: ["stubBefore"]`

### Requirement: The manifest stays one shape
`waygraph manifest` and the host SHALL produce the same manifest. Version 2 fields SHALL keep their meaning; the version
SHALL be 3.

#### Scenario: Old fields are unchanged
- **WHEN** a version 2 consumer reads `blocks[].from`, `flows[].steps` and `flows[].stepExpects` from a version 3 manifest
- **THEN** they SHALL hold what they held in version 2
