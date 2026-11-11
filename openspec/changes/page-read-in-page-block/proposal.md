## Why

A page's read lives apart from the page. A page folder has `_page.block.ts` (the page object), `_read.block.ts` (what it
shows), `_reads.ts` (the keys' types) and `_sel.ts`. Developers and agents manage three files for one idea, and the
Read Block is a Block kind of its own, though a page "just shows what it shows" (a blog post page, a list page: still
the same page object). The closer model is the page object model: the page declares what you can do (`do`), how you get
there (`nav`), what you can expect (`expects`) and what it shows (`read`), in one place.

## What Changes

- **`read` in the Page Block:** `definePageBlock({ ..., read: (ctx) => ({ ... }) })` returns a typed object. Its types are
  inferred: no `_reads.ts`, no `reads("ns")<{...}>()` declaration. Fields are reached through the page:
  `Inventory.read.sort.is("az")`, `Inventory.read.items.passes(...)`.
- **Read Block as a kind is removed.** `_read.block.ts` goes. The reading mechanism stays (the run still reads the landing
  page after each step: run log, demo, Studio, `Key.is` / `.passes`).
- **Shared reads** (a header on every page) go in a layout's `read`, which exists.
- **A page whose shape varies** (a blog: a post, a list) returns what is there; fields are optional.
- **A codemod** (`waygraph upgrade --codemod reads`) folds each `_read.block.ts` and `_reads.ts` into its Page Block.
- **Lifecycle:** read stays after `expect`, on the landing page; the guide ("How a run works") says so.

## Capabilities
### New Capabilities
- `page-read`: a Page Block's `read`, inferred field types, `Page.read.<field>`, layouts' shared read, the codemod.
### Modified Capabilities
<!-- Read Blocks (page-reads-and-key-namespaces) are replaced; its main spec is archived -->

## Impact
- **Engine:** `engine/read/` (read registration from Page Blocks and layouts), `Page.read`; remove `defineReadBlock`/`reads()` (BREAKING; codemod).
- **Scan/manifest/Studio:** read fields come from Page Blocks; Studio's "Read Blocks" tab becomes "Reads" by page.
- **Docs/skills:** the reads guide, blocks guide, convention skill, scaffold and examples; the deprecated page.
- **Parity:** the same with one page and with panes (a pane's landing page is read by its Page Block).
