# Scaffold layout (`waygraph init`)

This scaffold uses the **Waygraph Map**: folders under `src/map/` mirror your app's URLs.
One folder = one page = one Checkpoint. `(group)` folders are organizational only (like
Next.js route groups) and never appear in a URL or Checkpoint name.

```text
.
├── package.json
├── .agents/skills/                    # waygraph skills for coding agents
├── config/waygraph.config.ts          # baseUrl, tests, extensions, webServer - no playwright.config
├── src/
│   ├── map/
│   │   ├── (app_base)/                # your app (opened via file:// here)
│   │   │   ├── home/                  # URL /home
│   │   │   │   ├── _nav.block.ts      # how to get here
│   │   │   │   ├── _page.block.ts     # "you have arrived" hub
│   │   │   │   ├── _sel.ts            # every selector for this page
│   │   │   │   ├── index.html         # offline fixture page
│   │   │   │   └── _methods/          # one action per Block
│   │   │   │       ├── add-item.effect.block.ts       # + instanceOptions (auto menu)
│   │   │   │       ├── remove-item.effect.block.ts
│   │   │   │       ├── clear-cart.method.block.ts
│   │   │   │       ├── assert-hello.method.block.ts   # + stubs + YAP slide
│   │   │   │       └── assert-item-added.method.block.ts
│   │   │   └── docs/                  # a second page, same shape
│   │   ├── (external)/mailpit/        # a different origin (mail catcher); owns _states.ts + _keys.ts
│   │   └── (external)/hoppscotch/     # API client, needs the hoppscotch extension; owns _states.ts + _keys.ts
│   ├── states/                        # the app's Checkpoints + mem keys
│   ├── accounts/                      # who signs in: account(name, { signIn: flow }); flows run map({ as })
│   └── flows/                         # use cases, one file per scenario (see flows/README.md)
│       ├── home/                      #   a page: hello, cart
│       ├── (user-stories)/            #   flows that cross pages
│       └── (external)/hoppscotch/     #   a tool on another origin
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
| Define a use case (success, failed, bad input) | one `*.flow.ts` in `src/flows/<page>/`, or `(user-stories)/` for one that crosses pages |
| Give a flow fake data | `registerMemStub(key, fake)` in a `*.mem-stubs.ts` file + `memStub: true` in the flow's options; live sessions use the same fakes as defaults (docs: the reference, Engine features, "memStub") |
| Explore by hand | `npm run auto` (headed) or `npm run auto:cli` |
| Check your work | `npm run check`, `npm run graph`, `waygraph map` |
| Share a tool's map with another project | `waygraph map pack hoppscotch`, then publish `.waygraph/packages/hoppscotch` |

`waygraph map` fails if a folder path stops matching the real URL it claims to represent.
Full convention: https://deviate-dv8.github.io/waygraph/consumer.html
