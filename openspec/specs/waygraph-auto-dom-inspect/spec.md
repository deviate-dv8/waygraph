# waygraph-auto-dom-inspect Specification

## Purpose
Lets an agent driving a `waygraph-auto` session read the live page's structure at a chosen,
token-budget-aware fidelity, without access to the target project's frontend source - closing
the gap between "here is the menu of runnable Blocks" (Phase 1) and "here is what the page
actually looks like," which blind Block authoring and the future Waygraph Copilot both need.

## Requirements

### Requirement: A `dom` op returns a structured snapshot of the live page
The session protocol SHALL accept a `dom` request and SHALL return a JSON-safe snapshot of
the current page's structure. The op SHALL be read-only: it SHALL NOT run a Block, mutate
`mem`, or navigate the page - the same guarantee `status` already gives.

#### Scenario: Requesting dom returns a snapshot without side effects
- **WHEN** a `dom` request is sent to a running session
- **THEN** the response SHALL contain a structured snapshot of the current page
- **THEN** the session's Checkpoint, `mem`, and page URL SHALL be unchanged afterward

### Requirement: `aria` is the default fidelity and uses Playwright's own AI-oriented snapshot
When no mode is given, or `--mode aria` is given, the snapshot SHALL be produced by
Playwright's `ariaSnapshotJSON` (`mode: "ai"`) on the page (or, in container mode, on the
selector's `Locator`) - not the deprecated `page.accessibility.snapshot()` API, which is
absent from this package's supported Playwright versions.

#### Scenario: Default mode is aria
- **WHEN** a `dom` request is sent with no `mode` specified
- **THEN** the response SHALL be produced via `ariaSnapshotJSON`, not the `full` DOM walker

#### Scenario: An optional depth limit is honored
- **WHEN** a `dom` request specifies `mode: "aria"` and a `depth`
- **THEN** the returned snapshot SHALL respect that depth, using Playwright's own `depth`
  option rather than a second, independent truncation pass

### Requirement: `full` mode is a bounded DOM walk that never returns unbounded output
`--mode full` SHALL return a subtree (tag, attributes, text content, children) built by
walking the live DOM, bounded by hard caps on depth, total node count, and per-node text
length. When any cap is hit, the response SHALL be explicitly marked `truncated: true` rather
than silently omitting content with no indication.

#### Scenario: A real, large page is capped, not dumped whole
- **WHEN** `--mode full` is requested against a page whose DOM exceeds the configured caps
- **THEN** the response SHALL stop at those caps
- **THEN** the response SHALL include `truncated: true`

#### Scenario: A small page under the caps is not marked truncated
- **WHEN** `--mode full` is requested against a page whose DOM is within the configured caps
- **THEN** the response SHALL include the whole subtree
- **THEN** the response SHALL include `truncated: false`

### Requirement: `--selector` scopes either fidelity to one element's subtree
`--selector` SHALL be an optional modifier on either `aria` or `full` mode, not a separate
mode value - when given, the snapshot SHALL cover only the subtree rooted at the first
element matching that selector, using the same underlying mechanism per mode
(`Locator.ariaSnapshotJSON` for aria; the same bounded walker rooted at that element for
full).

#### Scenario: A selector scopes the snapshot to its subtree
- **WHEN** a `dom` request is sent with a `selector` that matches an element
- **THEN** the response SHALL cover only that element's subtree, not the whole page

#### Scenario: A selector matching nothing fails clearly
- **WHEN** a `dom` request is sent with a `selector` that matches no element
- **THEN** the response SHALL indicate the error rather than returning an empty or misleading
  snapshot

### Requirement: Phase 1 behavior and headful mode are unaffected
This capability SHALL be additive only - `status`, `send`, and `attach` from
`waygraph-auto-cli-session-control` SHALL behave exactly as they did before this change, and
headful (non-`--cli`) `waygraph auto` SHALL be unaffected.

#### Scenario: Existing session ops are unchanged
- **WHEN** `status`, `send`, or `attach` is used against a session that also supports `dom`
- **THEN** each SHALL behave exactly as specified in `waygraph-auto-cli-session-control`
