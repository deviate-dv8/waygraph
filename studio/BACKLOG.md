# Backlog

## Questions

- **One project or several.** `WAYGRAPH_PROJECT_DIR` names one folder. Should the app open several projects (a picker, a
  recent list) or stay one per instance?

## Next

- A shell's own moves (`do`) valid on the pages it covers; Studio shows its links and interrupts only.
- Pages tab: sort by failing, filter by shell.

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
