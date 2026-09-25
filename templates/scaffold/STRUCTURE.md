# Scaffold layout (`waygraph init`)

This scaffold uses the **Waygraph Map**: folders under `src/map/` mirror your app's URLs.
One folder = one page = one Checkpoint. `(group)` folders are organizational only (like
Next.js route groups) and never appear in a URL or Checkpoint name.

```text
.
├── package.json
├── src/
│   ├── map/
│   │   ├── (app_base)/                # your app (served on :4177 here)
│   │   │   ├── home/                  # URL /home.html
│   │   │   │   ├── _nav.block.ts      # how to get here
│   │   │   │   ├── _page.block.ts     # "you have arrived" hub
│   │   │   │   ├── _sel.ts            # every selector for this page
│   │   │   │   ├── home.html          # offline fixture page
│   │   │   │   └── _methods/          # one action per Block
│   │   │   │       ├── add-item.effect.block.ts       # + instanceOptions (auto menu)
│   │   │   │       ├── remove-item.effect.block.ts
│   │   │   │       ├── clear-cart.method.block.ts
│   │   │   │       ├── assert-hello.method.block.ts   # + stubs + YAP slide
│   │   │   │       └── assert-item-added.method.block.ts
│   │   │   └── docs/                  # a second page, same shape
│   │   └── (external)/mailpit/        # a different origin (mail catcher)
│   ├── states/                        # Checkpoint types + mem keys
│   └── flows/                         # example / shop / mail-verify
├── scripts/                           # local fixture server
└── tests/example.spec.ts
```

Underscore-prefixed files (`_nav`, `_page`, `_sel`, `_methods/`) are the fixed names every
page folder uses, so any agent or teammate knows where to look without asking.

## What each piece is for

| Want to... | Look at |
|---|---|
| Add a page | copy a folder under `src/map/`, keep the `_nav` / `_page` / `_sel` names |
| Add an action on a page | one file in that page's `_methods/` |
| Verify a state (button disabled, error shown) | `defineAssertBlock` + `Trait.disabled` / `Trait.enabled` |
| Wire steps together | `src/flows/*.flow.ts` |
| Give a flow fake data | `registerMemStub(key, fake)` + `withMemStub(flow)` (docs: docs/REFERENCE.md, "memStub") |
| Explore by hand | `npm run auto` (headed) or `npm run auto:cli` |
| Check your work | `npm run check`, `npm run graph`, `waygraph map` |

`waygraph map` fails if a folder path stops matching the real URL it claims to represent.
Full convention: https://deviate-dv8.github.io/waygraph/consumer.html
