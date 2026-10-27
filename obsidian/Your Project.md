---
tags:
  - waygraph
  - project
aliases:
  - Project layout
  - Scaffold
---

# Your project

`npx waygraph init` makes this layout:

```text
config/waygraph.config.ts   baseUrl, extensions, video, demo pace, test settings; exports `engine`
src/
  map/                      the Waygraph Map: one folder per page, mirroring the app's real URLs
    (app_base)/home/          _nav.block.ts  _page.block.ts  _sel.ts  _methods/*.block.ts
    (external)/mailpit/       another origin; owns _states.ts + _keys.ts (packable)
  states/                   the app's Checkpoints and mem keys
  accounts/                 who signs in: account(name, { signIn }) - a flow runs map({ as }) and starts signed in
  flows/                    use cases: <page>/<outcome>.flow.ts, (user-stories)/ for flows that cross pages
tests/                      Playwright tests that run flows
```

- **The folder is the map.** A page folder's path must match its real URL (`waygraph map` fails otherwise). `(group)`
  folders and `_`-files are organisation only.
- **Fixed names** in every page folder: `_nav` (how to get here), `_page` (you've arrived), `_sel` (its selectors),
  `_methods/` (one action per file).
- **Flows are use cases**, named for their outcome: `flows/auth/login/success.flow.ts`.

Commands you'll use: `waygraph check` (lint), `graph` (draw the map), `test`, `run`, `demo`, `auto`.
