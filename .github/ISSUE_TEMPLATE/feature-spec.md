---
name: Feature / overhaul spec
about: A design worth writing down before touching code - new primitive, breaking
  change, or anything that cascades across the API
title: "[Area] <short name>"
labels: spec
---

<!--
Use for a real feature, an overhaul, or a breaking change - not a one-line bug fix
(open a plain issue for that instead). Fill every section; delete a section only
when "When there's nothing to design" below says to.
-->

## Background & Context

<!-- Why this exists. What's awkward or impossible today without it. What triggered
     the ask (a real use case, not a hypothetical). -->

## Scope

**In scope**
-

**Out of scope (must not change)**
-

## Design decisions

<!-- One heading per decision that has a real alternative. State the decision, then
     what else was considered and why it lost. This is the section a future reader
     checks before re-litigating a call that was already made on purpose. -->

### Decision: <short name>

**Considered:** <the alternative(s)>
**Rejected because:** <the concrete reason - a bug it would cause, a guarantee it
would break, complexity it would add for no real benefit>
**Chosen:** <what this spec actually does instead>

## Acceptance criteria

<!-- One checkbox per concretely verifiable outcome - something a test can assert,
     not "works well" or "is clean." -->

- [ ]

## Implementation notes

<!-- File paths, function/type names, the actual code shape. Everything above this
     line stays readable without needing to already know the codebase; everything
     technical lives here. -->

-

---

## When there's nothing to design

A pure refactor or internal cleanup with zero API-shape change doesn't need Design
Decisions or Scope - say so plainly instead:

`No design decisions - this is a straight <refactor/cleanup>, no API shape change.`

Acceptance criteria is then just: existing tests still pass, plus whatever the
refactor specifically fixes.
