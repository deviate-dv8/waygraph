## ADDED Requirements

### Requirement: A page declares what it shows
`definePageBlock` SHALL accept `read: (ctx) => object`. After a step lands on the page, waygraph SHALL call it and
record the result with the step (run log, demo, Studio). Field types SHALL be inferred from the returned object.

#### Scenario: Checking a field
- **WHEN** a step lands on `Inventory` and `Inventory.read.sort.is("az")` is in its `expect`
- **THEN** the step SHALL pass when the page's sort reads `az`, and TypeScript SHALL reject `Inventory.read.sorts`

### Requirement: Shared reads live in layouts
A layout's `read` SHALL be read on every page the layout covers, merged with the page's own.

### Requirement: A page whose shape varies
Fields of `read` MAY be optional; an absent field SHALL read as absent, not as an error.

### Requirement: Migration
`waygraph upgrade --codemod reads` SHALL fold each `_read.block.ts` and `_reads.ts` into its page's Page Block.
