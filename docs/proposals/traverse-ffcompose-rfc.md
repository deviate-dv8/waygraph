# RFC: Traverse + FFComposeBlock (graph regression, parallel, session fork)

**Status:** Phase A in progress (2026-09-17 Dan approve). `fastForwardComposeBlock` shipped for **waygraph demo** pacing; traverse (B+) not started.
**Depends on:** existing `composeBlock`, `chainFlow` / `withSessionReset`, `waygraph auto` graph discovery, CLI `--blocks` / file-select patterns.
**Goal:** walk the whole Block graph as integration regression, fail loud at the first break, parallelize safely, skip boring prefixes via FFCompose.

**Relevance:** FFCompose is **mostly for demo** (collapse boring auth/seed so the interesting Blocks get the overlay). Traverse later reuses the same unit as a seed prefix.

ASCII only.

---

## 1. Problem

Today:

- `demo` / `run` / `--blocks` exercise **authored paths** (flows, ad hoc chains).
- `auto` explores **interactively** (picker / headful menu) - not a full-graph regression runner.
- Auth / setup Blocks get re-watched or re-run on every path. Boring, slow, and the real bug is usually *after* login.
- When a Block breaks mid-graph, there is no first-class "traverse id + leaf / fail locus" report that tells you where to start fixing.

Need:

1. A **traverse** client that walks nodes (Checkpoints) / edges (Blocks) like a graph crawler.
2. **FFComposeBlock** so boring prefixes (auth, seed, nav-to-app) collapse into one fast-forward unit attachable to a Flow / traverse seed.
3. **Parallel** traverses that **inherit or clone** browser sessions so workers do not all re-login.
4. **Regex / glob file select** so auto/traverse discovery does not need a hand-maintained file list every time Blocks move.
5. Hard **anti-loop** and clear **leaf PASS** reporting.

CLI parity standing rule (Dan): every waygraph CLI surface that can take work should support **shorthands** (`--blocks …`) **and** **file select** (path / glob / regex). Traverse is not exempt.

---

## 2. Vocabulary

| Term | Meaning |
|------|---------|
| **Node** | Checkpoint tag (`LoginPage`, `LoggedIn`, …). |
| **Edge** | A Block (or composed / FF-composed unit) from `from` -> `to`. |
| **Traverse** | One waygraph client walking the graph from a seed (checkpoint + mem + optional browser context). |
| **Leaf** | A node with no unused legal outgoing edges under current policy (or policy says stop). |
| **FFComposeBlock** | Fast-forward compose: same shape as `composeBlock`, run as **one** opaque step for demo/traverse pacing (no per-inner-step overlay), still real acts under the hood. |
| **Session inherit** | Child traverse reuses the **same** Playwright BrowserContext (cookies, storage, open pages) as parent. |
| **Session clone** | Child gets a **copy** of storage state (cookies/localStorage) into a **new** context (isolated tabs; parent keeps going). |
| **Split** | Spawn child traverse(s) from a node (or after an FFCompose landing) to fan out remaining edges in parallel. |

Pass line shape (Dan):

```text
[Reached Leaf Node[traverse-1 OR traverse-2-split-from-block]]
```

Fail line should mirror locus:

```text
[Broke at edge[traverse-2-split-from-submit-login] block=submit-login from=LoginPage to=LoggedIn]
```

---

## 3. Prereq: FFComposeBlock

### 3.1 Why not plain `composeBlock`?

`composeBlock` already nests steps into one Flow-slot Block. Gaps for this plan:

- Demo / step overlay still wants to **see** inner steps sometimes; FF means **never** gate/ring per inner step unless opted in.
- Traverse coverage metrics need to mark FF inners as **covered-via-prefix** vs **directly traversed** (else "we tested login 400 times" noise, or the opposite: login never counted).
- Session fork points should sit on **FF boundaries** ("after auth FF, split") more often than mid-auth.

### 3.2 Shape (proposed)

```ts
// sketch only
fastForwardComposeBlock("ff-owner-auth", [
  NavLoginBlock,
  SubmitLoginForFlow,
  // ...
]);
// attach: defineFlow([start, ffOwnerAuth, /* interesting blocks */, end])
// or: traverse seed { ff: "ff-owner-auth", then: "explore from LoggedIn" }
```

Rules:

- Same typing / connect rules as `composeBlock` (In/Out chain must typecheck).
- Runtime: one `act` that runs inners in order; verify = last step's verify (or explicit compose verify).
- Demo: one panel row `ff-owner-auth` (optional expand for debug: `--ff-expand`).
- Errors: fail names **inner block** + FF name (`ff-owner-auth > submit-login`).
- Mem: inners still `requires` / `mem.set`; FF declares union of requires for seeding.

### 3.3 Attach points

- Inside `defineFlow([...])` like any Block.
- As traverse **seed prefix**: `traverse --ff ff-owner-auth --from LoggedIn`.
- As **per-worker bootstrap** before parallel fan-out.

---

## 4. Traverse product

### 4.1 CLI sketch (shorthand + file select)

```bash
# file / glob / regex discovery (same spirit as --blocks file select)
waygraph traverse .
waygraph traverse --blocks 'src/blocks/**/*.block.ts'
waygraph traverse --blocks '/auth|checkout/'          # regex on path or block name (policy TBD)
waygraph traverse --flow checkoutFlow --ff ff-owner-auth

# parallelism + session
waygraph traverse --parallel 4 --session clone --ff ff-owner-auth
waygraph traverse --parallel 2 --session inherit --split-at LoggedIn

# safety
waygraph traverse --max-visits 3 --max-steps 200 --timeout 15m
```

Standing: `demo` / `run` / `auto` / `traverse` all accept `--blocks` **and** path/glob/regex. Do not invent a third flag forest; extend the existing `--blocks` parser carefully.

### 4.2 Algorithm (default)

1. Discover graph (reuse `discoverGraph` / auto loaders) filtered by file select.
2. Apply FFCompose as supernodes (inners collapsed for walk policy; still executable).
3. Seed: start checkpoint + mem (`--data`) + optional FF bootstrap.
4. Walk: at each node, pick unused legal edges (deterministic order default; optional random for soak).
5. On **branch fan-out** (multiple unused edges) and `--parallel > 1`: **split** (clone or inherit per flag).
6. Stop when leaf / budget / error.
7. Emit PASS leaf lines + FAIL edge lines + coverage summary (edges hit / skipped / ff-covered).

### 4.3 Pass / fail contract

- **PASS traverse:** reached a leaf under policy without unverified failure.
- **PASS suite:** all traverses PASS (or allow `--allow-expected-failure` for viewer-blocked-style flows).
- **FAIL:** first broken edge (verify throw, act throw, timeout, loop kill) - print locus; non-zero exit.
- Coverage report is **not** a substitute for FAIL - a green leaf with 10% edges hit is still PASS for that traverse, but suite mode can require `--min-edge-coverage`.

---

## 5. Parallelism + session inherit / clone

### 5.1 Why

FF gets you to `LoggedIn` once. Then N workers explore disjoint subgraphs without N full logins.

### 5.2 Inherit vs clone

| Mode | BrowserContext | Isolation | Speed | Risk |
|------|----------------|-----------|-------|------|
| **inherit** | Shared | Low - workers stomp the same cookies/tabs | Fastest | Race on same page; logout in one kills all |
| **clone** | New context + `storageState` copy | High | Slightly slower | Stale clone if parent mutates auth after fork |

Default for `--parallel > 1`: **clone**. Inherit is opt-in and documented dangerous.

### 5.3 Split policy

- Split only at **stable checkpoints** (prefer post-FF, post-nav settle).
- Each child gets: `traverseId`, `parentId`, `splitFromBlock` / `splitFromNode`, mem snapshot, storage snapshot (clone), edge claim set (work queue).
- Parent may continue on remaining edges or become coordinator only (`--split-mode coordinator|continue`).

### 5.4 Work claiming

Avoid two clones running the same edge:

- Central **edge lease** file/JSON under `.waygraph-traverse/` (or in-memory coordinator process).
- Lease TTL + heartbeat; dead worker releases leases.
- Deterministic partition alternative: hash(edge) % N (no runtime coordinator) - simpler, worse for uneven graphs.

---

## 6. Regex / glob file select

Today: `walkDir` + fixed `*.block.ts` / `*.flow.ts` patterns in auto/graph loaders.

Wanted:

- `--blocks 'src/blocks/**/*.block.ts'`
- `--blocks '/saucedemo-web\\/(cart|checkout)/'` (regex)
- Optional package.json `waygraph.traverse.include` / `exclude`

Edge: regex vs glob ambiguity - pick one grammar:

- Strings with `*` or `**` -> glob
- Strings wrapped in `/.../` -> regex
- Bare export names stay today's `--blocks shopFlow` shorthand

Do **not** make authors edit traverse configs every time a Block file moves if include is directory-scoped.

---

## 7. Edge cases (expand aggressively)

### 7.1 Looping to death (Dan - first)

- **Symptom:** A <-> B cycle, or NavBlock `"*"` always legal, or Effect that returns same checkpoint.
- **Default:** `--max-visits-per-node` (e.g. 2) and `--max-visits-per-edge` (e.g. 1 for regression; 2+ for soak).
- **Global:** `--max-steps` per traverse; `--max-wall` timeout.
- **Kill:** on budget exceed, SIGTERM child pid / BrowserContext.close, emit:
  `[Killed loop[traverse-3] node=CartPage visits=4 max=2]`
- **Nav `"*"`:** do not treat every nav as always-unexplored forever - mark nav edges visited per (fromSnapshot, block) or require explicit `--reentry-nav`.

### 7.2 Leaf definition ambiguity

- No outgoing edges vs all outgoing **visited** vs all outgoing **excluded by filter**.
- Expected-failure flows (`viewerBlockedFlow`) - leaf might be "stayed on LoginPage with error" - must not look like a product FAIL.
- Multiple sinks (`OrderComplete` vs `LoggedOut`) - both are valid leaves.

### 7.3 Branching Method Blocks

- `submit-login` Out is a union; static graph may show one `to`, runtime may go elsewhere.
- Traverse must record **observed** Out, not only static edge `to`.
- Mismatch static vs observed = WARN or FAIL under `--strict-graph`.

### 7.4 instanceOptions / Effect fan-out

- `add-to-cart` has one static edge but N live instance options.
- Policy: expand to virtual edges per option (like auto menu), or sample K, or require mem seed.
- Parallel clones must not claim the same `(block, instanceId)`.

### 7.5 FFCompose inner failure

- Fail locus must name inner step.
- Partial FF (died mid-auth) - do not clone session from a half-logged-in context; mark bootstrap FAIL.

### 7.6 Session inherit races

- Two inherits click different buttons on one page -> flake hell.
- Rule: inherit allowed only with `--parallel 1` **or** single-page lock (mutex) - probably just forbid inherit+parallel.

### 7.7 Session clone staleness

- Parent logs out after fork -> clones still "logged in" until next request fails.
- Parent's FF used TOTP/one-time - clone cannot redo; document FF must be clone-safe (password login OK; SMS OTP not).

### 7.8 Mem identity / MemKey double-load

- Already hit in demos: MemKey is identity-keyed. Child traverse must load **same module instance graph** or re-seed by name carefully.
- Clone mem by **name -> JSON value**, re-`set` on child's MemKey instances after import.

### 7.9 Cookie / origin / baseURL drift

- Clone storageState from `https://a` then child uses `--base-url https://b` -> silent empty session.
- Assert origin match at fork.

### 7.10 Parallel resource blowup

- N Chromiums * video * headed = OOM.
- Defaults: headless for traverse, no video unless `--video`, cap `--parallel` to CPU or explicit max (e.g. 4).

### 7.11 Orphans and unreachable

- Orphan Blocks (not in any flow) - include in traverse discovery? Default **yes for traverse**, no for "flow-only" mode.
- Unreachable from seed after FF - report as **UNREACHED**, not PASS.

### 7.12 Flaky verify vs hard break

- Distinguish timeout flake (retry 1) vs assert fail (no retry by default).
- `--retries` only for listed flake traits if ever needed - default 0 for regression honesty.

### 7.13 Demo overlay / traverse interaction

- Traverse is not demo. No step gates. If someone passes `--step`, either reject or run serial demo-traverse hybrid (probably reject).

### 7.14 Expected failure / negative paths

- Locked-out user, 403, empty states - need `expectedFailureReason` (already on flows) honored by traverse PASS criteria.

### 7.15 Graph mutation during run

- Hot reload / file change mid-traverse - freeze graph snapshot at start; ignore FS changes until done.

### 7.16 PID / process tree

- CLI parent spawns workers; Ctrl-C must kill browsers + children (process group).
- Loop-kill and wall-timeout same path.
- Zombie contexts: always `browser.close` in `finally`.

### 7.17 Idempotent Effects

- Re-add-to-cart when already added - edge may  fail verify; visit policy should mark effect edges carefully (precondition check via instanceOptions empty list = skip).

### 7.18 Ordering / fairness

- Depth-first finds deep bugs fast; breadth-first better coverage early.
- Default DFS with deterministic edge sort; `--bfs` optional.
- Starvation: one fat branch hogs parallel workers - work stealing or edge leases fix this.

### 7.19 Reporting / CI

- JUnit or JSON summary under `.waygraph-traverse/report.json`.
- Exit codes: 0 all pass, 1 fail, 2 killed/budget, 3 usage.
- Leaf PASS lines must be greppable; agents parse `traverseId`.

### 7.20 Naming collisions

- Two Blocks same `.name` different files - discovery already fragile; traverse must FAIL discovery on duplicate runtime names.

### 7.21 FF + demo narration

- Slides/stubs on inner blocks invisible in FF unless `--ff-expand`. Document that AC narration for auth lives on non-FF flows or expand mode.

### 7.22 Split-from-block id stability

- `traverse-2-split-from-submit-login` must be stable across runs for flake bisect - include edge id / block name / counter, not random UUIDs only (UUID ok as suffix).

### 7.23 Empty graph / empty filter

- Regex matches nothing -> hard FAIL with "0 blocks matched", do not fake PASS leaf.

### 7.24 Start with no FF but needs auth

- Seed on `Inventory` without session -> cascade fails; preflight: if seed checkpoint requires auth mem/session, demand `--ff` or `--storage-state`.

### 7.25 Playwright storageState limits

- Some sites put auth in httpOnly cookies only (clone works); some in memory/JS (clone fails). Document; offer `--ff` per worker as fallback (slower).

---

## 8. Phased delivery

| Phase | Ship | Notes |
|-------|------|-------|
| **A** | `fastForwardComposeBlock` + demo/run treat as one step | **DONE (demo-first):** saucedemo `ff-owner-auth`, `--ff-expand` |
| **B** | `waygraph traverse` serial + max-visits + leaf PASS lines | No parallel yet |
| **C** | Glob/regex `--blocks` shared by auto/traverse/demo | CLI parity |
| **D** | `--parallel` + `--session clone` + edge leases | inherit later or never |
| **E** | Coverage gate + JSON report + CI recipe | |

Do not start D before A+B loop-safety is real.

---

## 9. Non-goals (this RFC)

- Replacing Playwright Test runner for unit-level Block tests.
- Teaching traverse to invent Blocks or rewrite flows.
- Shared headed demo UI across parallel workers (traverse is CI/headless-first).
- Full model-based testing / combinatorial instanceOptions explosion without caps.

---

## 10. Open questions (need Dan later - not blockers for draft)

1. Default `--max-visits-per-edge` = 1 (regression) or 2 (allow one retry path)?
2. Is **inherit** ever allowed, or clone-only forever?
3. Should FF inners count as covered for `--min-edge-coverage`?
4. Traverse command name: `traverse` vs `auto --crawl` vs `regress`?
5. Regex on **file path**, **block name**, or both?

---

## 11. One-screen summary

```text
FFCompose(auth) -> seed LoggedIn
  -> traverse-1 walks cart/*
  -> clone split -> traverse-2 walks checkout/*
  -> clone split -> traverse-3 walks inventory effects
Budgets kill loops. Leaf => [Reached Leaf Node[traverse-N ...]]
Break => [Broke at edge[traverse-N] block=... from=... to=...]
CLI: --blocks shorthand + glob/regex file select, everywhere.
```

---

## 12. Edge-case checklist (quick)

- [ ] Loop / max-visits / max-steps / wall clock / kill pid
- [ ] Leaf vs unreached vs expected-failure
- [ ] Static graph vs runtime branch Out
- [ ] instanceOptions fan-out + leases
- [ ] FF inner fail locus + half-auth clone forbid
- [ ] inherit+parallel forbid (or mutex)
- [ ] clone staleness / OTP / origin mismatch
- [ ] MemKey identity across workers
- [ ] Resource caps (browsers, video)
- [ ] Orphans / duplicates / empty match
- [ ] Ctrl-C process group
- [ ] Graph snapshot freeze
- [ ] Idempotent effects
- [ ] DFS/BFS fairness
- [ ] Greppable PASS/FAIL ids
- [ ] `--step` rejected on traverse
- [ ] Preflight seed needs auth
