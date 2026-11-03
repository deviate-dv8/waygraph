# Blocks

A Block is one step: it starts on a Checkpoint, does one thing, and lands on a Checkpoint.

```mermaid
graph LR
  A[Home] -->|add-item| B[ItemInCart]
  B -->|clear-cart| C[CartEmpty]
  C -->|add-item| B
```

## Checkpoints first

A Checkpoint is a place the app can be. Each one is declared once, in `src/states/`, as a value and a type with the
same name:

```ts
// src/states/demo.states.ts
import { checkpoint } from "waygraph";

export const Home = checkpoint("Home");
export type Home = typeof Home;
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
export const CartEmpty = checkpoint("CartEmpty");
export type CartEmpty = typeof CartEmpty;

export const CanAddItem = [Home, CartEmpty] as const;   // "any of these"
export type CanAddItem = (typeof CanAddItem)[number];
```

Two Checkpoints can share a URL: `Home` and `ItemInCart` are the same page in two states.

One Checkpoint comes with waygraph: `Start`, where every flow begins, before its first step. A Block that leads off a
flow starts `from: Start`; one that sends the run back to the beginning (signing out) goes `to: Start`.

```ts
import { Start } from "waygraph";

defineMethodBlock({ name: "sign-out", from: Dashboard, to: Start, instruction: { … } });
```

## The kinds

| Kind | Use it to | Made with | Moves? |
|---|---|---|---|
| Nav | open a page by URL or by a link | `defineNavBlock` (`url`) · `defineNavClickBlock` (`click`) | to its `checkpoint` |
| Page | say "you are here" and list what you can do | `definePageBlock` | no |
| Method | do one thing: fill, click, submit | `defineMethodBlock` | `from` → `to` |
| Effect | do one thing to one row of many | `defineEffectBlock` | `from` → `to` |
| Expect | what a scenario expects on a page: reads and judges, changes nothing | `defineExpectBlock` | no (an expectation, not a step) |
| API | make an HTTP call, no page | `defineApiBlock` | `from` → `to` |
| Read | say what the page shows | `defineReadBlock` | never ([Read Blocks](./reads)) |

All of them are plain Blocks when the flow runs; the kind is what `map()` and `waygraph check` hold you to.

## Nav: getting to a page

```ts
export const NavHomeBlock = defineNavBlock({
  name: "nav-home",
  description: "Opens the catalog page.",
  checkpoint: Home,
  url: "/home",                                    // or (mem) => `/orders/${mem.get(OrderKeys.id)}`
  verify: [Trait.text(DemoSel.title, "Hello Waygraph")],
});
```

Only Nav Blocks navigate. In any other Block, `page.goto` / `reload` / `goBack` show as deprecated in the editor, and
`waygraph check` warns about them.

A Nav can be opened from anywhere by default. A page you can only reach after signing in says so with `from`, so route
finding (`auto`, `pilot reach`, `traverse`) signs in first:

```ts
export const SIGNED_IN = [Dashboard, Settings] as const;
defineNavBlock({ name: "nav-equipment", checkpoint: Equipment, url: "/equipment", from: SIGNED_IN });
```

## Method: one action

```ts
export const ClearCartBlock = defineMethodBlock({
  name: "clear-cart",
  description: "Clears every item via the Clear cart control.",
  from: ItemInCart,
  to: CartEmpty,
  instruction: {
    async act(page) {
      await page.locator(DemoSel.clear).click();
    },
    verify: [Trait.text(DemoSel.cartCount, "0")],
  },
});
```

**One action per Block.** A login form is `fill-username`, `fill-password` and `submit-login`: three Blocks, never
one. `waygraph check` warns on a Method that fills more than once or fills and clicks.

When a Block can land in more than one place, `to` is a list and `resolve` picks the one it reached:

```ts
defineMethodBlock({
  name: "submit-login",
  from: LoginPage,
  to: [LoggedIn, LoginPage],                        // a wrong password stays here
  instruction: {
    async act(page) { await page.locator(LoginSel.submit).click(); },
    async observe(page) { return page.url().includes("/inventory") ? "in" : "out"; },
    resolve: (seen) => (seen === "in" ? LoggedIn : LoginPage),
  },
});
```

| Phase | Does | May touch |
|---|---|---|
| `act` | the action | the page, mem |
| `observe` | looks at what happened (only when `to` is a list) | the page, mem |
| `resolve` | names the Checkpoint | nothing: it gets only what `observe` returned |
| `verify` | checks the page is what `resolve` said ([Checks](./checks)) | reads only |

## Page: the hub {#page-blocks}

```ts
export const HomePage = definePageBlock({
  name: "page-home",
  checkpoint: Home,
  nav: NavHomeBlock,                                 // its _nav.block.ts
  verify: [Trait.visible(DemoSel.catalog)],
  methods: {
    addItem: () => AddItemBlock,
    clearCart: () => ClearCartBlock,
  },
});
```

A Page Block is the page's namespace: `HomePage.nav` opens it, `HomePage.do.addItem` is the Add Item Block, typed as
itself, and `HomePage.expects.itemAdded` an Expect Block for the page (`expects: { itemAdded: () => ExpectItemAddedBlock }`).
A flow imports the page, not each Block:

```ts
engine.map().gotoPage(HomePage.nav).method(HomePage.do.addItem, { expect: [HomePage.expects.itemAdded] });
```

`waygraph auto` groups a page's methods under it, and they never count as orphans. Name the Page Block after the page
(`HomePage`): the Checkpoint already has the page's own name (`Home`).

## Effect: one row of many

An Effect is a Method that also lists the rows it can act on, so `waygraph auto` shows "Add Alpha", "Add Beta"…:

```ts
defineEffectBlock({
  name: "add-item",
  from: CanAddItem,
  to: ItemInCart,
  requires: [DemoKeys.selectedItem],
  instruction: {
    async act(page, _input, mem) {
      await page.locator(DemoSel.addBtn(mem.get(DemoKeys.selectedItem).id)).click();
    },
  },
  async instanceOptions(page) {
    // one { id, label, key: DemoKeys.selectedItem, value, highlight } per Add button on the page
  },
});
```

## Expect and API

```ts
export const ExpectSubmitGatedBlock = defineExpectBlock({
  name: "expect-submit-gated",
  description: "Continue stays disabled until the form is filled.",
  checkpoint: CheckoutInfoPage,
  verify: [Trait.disabled(CheckoutSel.submit)],
});

export const CheckOrderCreatedBlock = defineApiBlock({
  name: "check-order-created",
  from: LoggedIn,
  to: [OrderConfirmed, OrderFailed],
  method: "GET",                                          // shown in the demo's network tab
  call: ({ request }) => request.get("/api/orders/latest"), // shares the browser's cookies
  resolve: (r) => (r.ok ? OrderConfirmed : OrderFailed),  // r = { status, ok, body }
});
```

An Expect Block goes in an `expect: [...]` list, on a Block or on a step, never as a step of its own; it only reads
([Checks](./checks#expect-what-the-scenario-expects)).

## Selectors live in `_sel.ts`

```ts
export const DemoSel = {
  title: "h1",
  cartCount: "[data-test=cart-count]",
  addBtn: (id: string) => `[data-test=add-${id}]`,
} as const;
```

A selector written inline in a Block, or a regex / XPath selector, is a `waygraph check` warning. Mem holds values
(which item); `_sel.ts` holds where things are on the page.

## Several Blocks as one

| Helper | Gives |
|---|---|
| `composeBlock(name, steps)` | one named Block made of several, each keeping its own `verify` |
| `fastForwardComposeBlock(name, steps)` | the same, played at full speed in the demo (sign-in you don't need to watch) |
| `withVerify(block, verify)` | the same Block with other checks |
| `withDialog(block, { accept, into })` | answers the `confirm()` / `alert()` the Block's action opens |

## Lint it

```sh
npx waygraph check        # navigation outside Nav Blocks, inline selectors, empty verify, orphans, pages no Read Block reads
npx waygraph typecheck    # tsc --noEmit, then the same checks
```

`check` also points out code written for something waygraph already does, in any file (helpers and specs too):

| Warning | Found | Use instead |
|---|---|---|
| `cast-to-outcome` | `Block as MethodBlock<A, B>` | `.method(Block, { lands: B })` (`upgrade --codemod lands`) |
| `ff-run` | `{ ff: true }` on three or more steps in a row | `.ffStart()` … `.ffEnd()` (`upgrade --codemod ff`) |
| `hand-rolled-retry` | a polling loop in a Trait file | nothing: Traits retry, and say what they wanted and saw |
| `seeded-spec` | `seedMemStub` in a spec | `memStub: true`: the flow fills keys when it runs |
| `builder-helper` | a function over `MapBuilder` | a part, `steps(Checkpoint, (m) => …)`, or an account for signing in |
| `overlay-workaround` | a dispatched click, a native value setter | `click()` and `fill()`: they work in a demo |
| `expect-one-read` | an Expect Block that is one read check | `Key.is(value)` in the step's `expect` |
| `mutating-expectation` | an Expect Block that clicks, types, navigates or sets mem | a Method step before it; the expectation only reads |
| `arrival-in-expect` | an Expect Block that only checks the URL or that something is visible | the `verify` of the Block that lands there |
| `outcome-in-verify` | a Method's `verify` that reads a message (a toast, an alert, an error) | `expect: [...]` on the step (or the Block's `expect` when every use expects it) |
| `start-tag` | `"__start__"` written by hand | `import { Start } from "waygraph"` |

Silence one warning on purpose with `// waygraph-ignore: empty-verify` (or any other kind: `multi-input`,
`combined-action`, `hand-written-ui`, `ff-run`, …) in that file.
