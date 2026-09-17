# Offline scaffold layout (`waygraph init` / `create-waygraph`)

Shipped under `templates/scaffold/` in the **waygraph** package.
Docs: [docs/scaffold.html](../../docs/scaffold.html)

```text
.
├── package.json
├── STRUCTURE.md              # this file
├── README.md
├── src/
│   ├── blocks/
│   │   ├── SITE-MAP.md
│   │   └── demo-web/         # synthetic "/" (HTTP fixture :4177)
│   │       ├── NAV.md
│   │       ├── home.html     # offline fixture (catalog + cart)
│   │       ├── demo-sel.ts
│   │       ├── nav-home.block.ts          # Nav
│   │       ├── home.page.block.ts         # Page hub (methods registry)
│   │       └── methods/
│   │           ├── assert-hello.method.block.ts   # Method + stubs + YAP
│   │           ├── add-item.effect.block.ts       # Effect + instanceOptions (auto)
│   │           ├── remove-item.effect.block.ts    # Effect + instanceOptions
│   │           └── clear-cart.method.block.ts     # Method
│   ├── states/
│   │   ├── demo.states.ts
│   │   └── demo.mem-keys.ts  # SelectedItem for Effect / auto
│   └── flows/
│       ├── example.flow.ts   # nav + assert (smoke)
│       └── shop.flow.ts      # nav + add-item + clear (Effect path)
├── scripts/
│   ├── fixture-server.mjs    # serves home.html on :4177
│   └── with-fixture.mjs      # start server + run waygraph auto/demo/run
└── tests/
    └── example.spec.ts
```

## Features covered

| Feature | Where |
|---------|--------|
| Nav (`defineNavBlock`) | `nav-home.block.ts` |
| Page hub (`definePageBlock` + `methods`) | `home.page.block.ts` |
| Method (`defineMethodBlock`) | `assert-hello`, `clear-cart` |
| Effect + `instanceOptions` (auto menus) | `add-item`, `remove-item` |
| Mem (`keyGroup`) | `demo.mem-keys.ts` |
| `stubBefore` / `stubAfter` / `stubOnError` | all instruction blocks |
| Flow fixtures + title | `example.flow.ts`, `shop.flow.ts` |
| YAP slides | `assert-hello` |
| `withSessionReset` | `shop.flow.ts` |
| `waygraph auto` / `auto --cli` | `npm run auto` |
| `demo` / `run` / `list` / `check` / `graph` | `package.json` scripts |

## Auto

```bash
npm run auto        # headed explore - pick Add Alpha / Add Beta from live DOM
npm run auto:cli    # same menus in the terminal
```

After `nav-home`, Effect blocks expose one menu row per visible Add/Remove button.
