# Offline scaffold layout (`waygraph init` / `create-waygraph`)

Shipped under `templates/scaffold/` in the **waygraph** package.
Same tree is what `npx waygraph init my-app` copies.

Docs (readable in the package site): [docs/scaffold.html](../../docs/scaffold.html)

```text
.
├── package.json              # waygraph ^0.12.6, demo/run/auto scripts
├── playwright.config.ts
├── tsconfig.json
├── STRUCTURE.md              # this file
├── README.md
├── src/
│   ├── blocks/
│   │   ├── SITE-MAP.md       # namespace map (consumer convention)
│   │   └── demo-web/         # synthetic site (data: URL) - mirrors app "/"
│   │       ├── NAV.md
│   │       ├── nav-home.block.ts
│   │       └── methods/
│   │           └── assert-hello.method.block.ts
│   ├── states/
│   │   └── demo.states.ts
│   └── flows/
│       └── example.flow.ts   # withTitle + withHighlightFixtures
└── tests/
    └── example.spec.ts
```

**Rule of thumb:** route folders = app URL folders; `/` lives at the namespace
root (`demo-web/`). Methods hang under `methods/`. Chrome/shared UI would be
`shared/chrome/` (not invented for this offline hello).

Grow this into a real app by renaming `demo-web/` to your FE origin namespace
and adding one folder per `page.tsx` URL. See package docs **Consumer layout**.
