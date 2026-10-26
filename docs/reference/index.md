> **Reference.** Everything waygraph does, one topic per page. New here? Start with the [README](https://github.com/deviate-dv8/waygraph#readme) or the [quick start](../quickstart.md).

# Waygraph

A typed graph of reusable Blocks for driving a browser through E2E flows, in place of a
flat pile of ad hoc helper functions.

Not yet `1.0.0` - breaking changes between minor versions are expected. See
[ROADMAP.md](https://github.com/deviate-dv8/waygraph/blob/main/ROADMAP.md) for what's shipped, spec'd, and planned, and
`openspec/specs/` for the current merged spec behind each capability
(`openspec/changes/archive/` holds the historical planning artifacts once a change ships).

This repo is the `waygraph` npm package itself. The full live **Sauce Demo** example
(Page inventory hub, Effect Add/Remove, MemNav Open details, `waygraph auto`) ships
in-tree at [`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo). `waygraph try demo` copies
[`templates/quickstart`](https://github.com/deviate-dv8/waygraph/tree/main/templates/quickstart) (same Sauce Demo Blocks) into an OS
temp dir.

## Pages

- [Getting started](./getting-started.md): install, quick start, the ways to begin
- [Project config](./config.md): `config/waygraph.config.ts`, `.env`, environments
- [Core concepts](./concepts.md): Checkpoints, Blocks, flows; the manifest; run events and the run log
- [Engine features](./engine.md): everything a Block and a flow can do
- [Block helpers](./block-helpers.md): Page, Method and Sel helpers
- [Mail adapters](./mail.md): reading mail in a flow (Mailpit, Mailhog, ...)
- [Pilot](./pilot.md): driving a live session as an agent, with or without Blocks
- [The Map](./map.md): the Map folder layout, map packages, migrating to it
- [CLI reference](./cli.md): every command and flag, an example, recipes
- [Developing waygraph](./developing.md): working on waygraph itself, and its source layout

Also: [environment variables](../env.md), [removed in 0.16.0](../deprecated.md).

## Docs (GitHub Pages)

Browser docs (quick start, **demo / run**, **auto explore**, engine handout, consumer
layout, deploy):

- **Published:** https://deviate-dv8.github.io/waygraph/ (workflow auto-enables Pages via
  `enablement: true`; manual Settings only if org policy blocks it)
- **Source:** [`docs/`](https://github.com/deviate-dv8/waygraph/tree/main/docs) - a VitePress site; `npm run docs:dev` serves it locally,
  `npm run docs:build` builds it (and fails on a dead link)
- **Deploy:** push to `main` touching `docs/**` runs
  [`.github/workflows/pages.yml`](https://github.com/deviate-dv8/waygraph/blob/main/.github/workflows/pages.yml) (`workflow_dispatch` also
  works)
- **Demo / run contract:** [Demo / run](../demo.md) - `list` / `.flow.ts` path / export / flags
- **Auto explore:** [Auto explore](../auto.md) - prefer `auto --cli` / `npm run auto:cli` (same menus as headed)
- **In-repo example:** [`examples/saucedemo`](https://github.com/deviate-dv8/waygraph/tree/main/examples/saucedemo) - full Sauce Demo
  project
- **Walkthrough:** [Sauce Demo example](../saucedemo/index.md) - its layout, Blocks, flows and narration
- **Helpers (consumer copy):** [`examples/saucedemo/docs/HELPERS.md`](https://github.com/deviate-dv8/waygraph/blob/main/examples/saucedemo/docs/HELPERS.md)

This README stays the in-repo API narrative; Pages is the same material for eyeballing and
cross-mesh handoff.
