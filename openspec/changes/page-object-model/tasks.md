## 1. Stage 1: the page object
- [x] 1.1 Type tests for `definePage` (read inference, `do`/`expects` as functions, no cycle)
- [x] 1.2 (read/do/expects as functions of the page; fields are Traits via Page.read.x.is/.passes) `definePage` with `read`, `expects`, `do`; reading after a step lands; fields as Traits
- [ ] 1.3 Key with `stub`; remove Read/Expect kinds, `_reads.ts`, `*.mem-stubs.ts`
- [~] 1.4 (codemod `page-object` done and validated on copies of two real projects; Studio page panel pending) Scan, manifest, graph, Studio (page state, moves, checks, last results); codemods `reads`, `expects`, `stubs`
- [ ] 1.5 Examples, scaffold, docs (reads, blocks, checks, data, lifecycle), skill; verify
## 2. Stage 2: nav from the folder, params
- [ ] 2.1 Address from the folder, `[id]`; `Page.go`; typed `params`/`query`; `setQuery`; arrival verifies path and query
- [ ] 2.2 Remove Nav Blocks; codemod `nav`; Studio shows query changes as state
## 3. Stage 3: interrupts
- [x] 3.1 `interrupts` on layouts via `addLocatorHandler`; run events; the demo shows a firing
## 4. Stage 4: Methods without `instruction`
- [ ] 4.1 `defineMethod` with `act`/`verify`/`precondition`/`lands`; codemod `instructions`; docs
