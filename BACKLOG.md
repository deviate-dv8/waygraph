# Backlog

## Questions

- **Sign-in.** The starter's sign-in and sign-up pages (and its SQLite users table) are still here, restyled, but no page
  needs them: the app is a local tool over one folder. Keep them for a shared or hosted install later, or remove them
  (and Lucid, the session guard, the database) until then?
- **One project or several.** `WAYGRAPH_PROJECT` names one folder. Should the app open several projects (a picker, a
  recent list) or stay one per instance?
- **Where it lives.** A separate repo (as now), or a package the waygraph CLI starts (`waygraph ui`)? The second needs
  the app built and shipped with waygraph, or installed on demand.

## Next

- Start `waygraph test` (every flow, or one) from the UI, and show its runs as one group.
- While a run plays, show the flow's remaining steps faded on its canvas, not only the steps played so far.
- A step's expectations as results: the run log records only the one that failed (`step:error` with `when: "expect"`);
  showing each expectation passed would need waygraph to log them.
- Demo flags in the UI: auto-next, fast, a title.
- Live sessions through the session protocol (`waygraph pilot`): the menu, reach a Checkpoint, what the page reads.
- A form over `config/waygraph.config.ts`.
- Functional tests for the pages (Japa's browser client), so the Playwright checks done by hand run in CI.
- The first page load after a dependency change can hit Vite's "Outdated Optimize Dep" until a reload; list the canvas
  libraries in `optimizeDeps.include` if it keeps happening.
