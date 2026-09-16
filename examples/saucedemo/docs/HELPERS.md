# Block helpers (convention)

Runtime is always a `Block`. Helpers are TypeScript salt + clear intent.

| Helper | Use when | File |
|--------|----------|------|
| `definePageBlock` | Screen hub (checkpoint + methods + optional Sel) | `*.page.block.ts` |
| `defineNavBlock` | URL / `goto` only | `nav-*.block.ts` |
| `defineNavClickBlock` | Click-to-navigate only | `nav-*.block.ts` |
| `defineMemNavBlock` | Nav + per-row `instanceOptions` | `nav-*.block.ts` |
| `defineMethodBlock` | One-shot non-nav app step | `*.method.block.ts` under `methods/` |
| `defineEffectBlock` | Instance mutate + auto menu rows | `*.effect.block.ts` under `methods/` |
| `defineBlock` | Escape hatch: tests, unsure, probes | any |
| `defineActionBlock` | **Deprecated** alias of `defineMethodBlock` | — |

`defineNavBlock({ click })` still works (compat) - prefer `defineNavClickBlock` in app code.

---

## Page hub + methods + Sel

One **PageBlock** = this screen. Methods hang off it. DOM strings live in `*Sel` (not in mem).

```ts
export const InventorySel = {
  list: ".inventory_list",
  addBtn: (id: string) => `[data-test="add-to-cart-${id}"]`,
  // …
};

export const InventoryPageBlock = definePageBlock({
  name: "page-inventory",
  checkpoint: "LoggedIn",
  verify: [Trait.url({ pathname: "/inventory.html" }), Trait.visible(InventorySel.list)],
  methods: {
    addToCart: () => AddToCartBlock,
    removeFromCart: () => RemoveFromCartBlock,
    addAllToCart: () => AddAllToCartBlock,
    removeAllFromCart: () => RemoveAllFromCartBlock,
    openDetail: () => NavItemDetailBlock,
  },
});
```

| Piece | Stores |
|-------|--------|
| `*Sel` | DOM selectors only (static + `(id) => …`) |
| Mem keys | Typed values (which item / queue) — not selectors |
| `instanceOptions` | Live DOM → menu rows → `mem.set` on pick |
| Predefined method | No `instanceOptions`; flow seeds mem first |

Live: `inventory/inventory.page.block.ts`, `inventory/methods/`.

**Round-trip (not forward-only):** cart Methods/Effects use `In = Checkpoint<string>`
so the graph edge is `from: "*"`. Auto lists them whenever the live page has matching
buttons (Add vs Remove), including after continue-shopping / back to inventory. Bulk
`add-all-to-cart` / `remove-all-from-cart` are one menu row each (no `instanceOptions`);
Out is `ItemInCart` vs `LoggedIn` from cart emptiness.

---

## Checkpoint vs `branch()`

| | **Checkpoint** | **`branch()`** |
|--|----------------|----------------|
| Answers | *Where* are you? (`LoggedIn`, `LoginPage`) | *Which Block runs next?* |
| How | `observe` + `resolve` -> union `Out` | `branch(block, { Tag: nextBlock \| null })` |
| Alone can | Label state; graph edges; verify | Route a `runGraph` walk |
| Alone cannot | Pick the next Block | Decide the state |

Checkpoint = place on the map. `branch()` = which road to take from that place.

Conditional Out (no `branch()` needed for auto/graph):

```ts
defineMethodBlock<LoginPage, LoggedIn | LoginPage>({
  name: "submit-login",
  instruction: {
    async act(page, _in, mem) { /* fill + click */ },
    async observe(page) {
      try {
        await page.waitForURL(/\/inventory\.html/, { timeout: 8000 });
        return "success";
      } catch {
        return "failure";
      }
    },
    resolve: (o) => checkpoint(o === "success" ? "LoggedIn" : "LoginPage"),
  },
});
```

Optional routing for `runGraph`:

```ts
branch(SubmitLoginActionBlock, {
  LoggedIn: AddToCartBlock,
  LoginPage: null, // stop
});
```

Linear `defineFlow([start, …, end])` usually skips `branch()` (one happy path).

---

## Mem / `instanceOptions` (spawns menu rows)

Not a separate runtime type. One Block + `requires` + `instanceOptions(page)` ->
`waygraph auto` lists **one row per live DOM match**. On pick: `mem.set(key, value)`
then run the Block (act reads mem as usual).

### Effect - spawn Method-like rows (Add / Remove)

```ts
defineEffectBlock<Checkpoint<string>, ItemInCart>({
  name: "add-to-cart",
  requires: [SelectedItem.key],
  instruction: {
    async act(page, _in, mem) {
      const { id } = mem.get(SelectedItem.key);
      await page.locator(InventorySel.addBtn(id)).click();
    },
    resolve: () => checkpoint("ItemInCart"),
  },
  async instanceOptions(page) {
    const items = await collectAddableItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Add "${item.name}" to cart`,
      key: SelectedItem.key,
      value: item,
      highlight: InventorySel.addBtn(item.id),
    }));
  },
});
```

Auto shows: `Add "Sauce Labs Backpack" to cart`, `Add "Bike Light"…`, …

### MemNav - spawn Nav rows (Open details)

```ts
defineMemNavBlock<ItemDetailPage>({
  name: "nav-item-detail",
  checkpoint: "ItemDetailPage",
  requires: [SelectedItem.key],
  click: (mem) => InventorySel.title(mem.get(SelectedItem.key).id),
  verify: [Trait.url({ pathname: "/inventory-item.html" })],
  async instanceOptions(page) {
    const items = await collectInventoryItems(page);
    return items.map((item) => ({
      id: item.id,
      label: `Open "${item.name}" details`,
      key: SelectedItem.key,
      value: item,
      highlight: InventorySel.title(item.id),
    }));
  },
});
```

Auto shows: `Open "Backpack" details`, … - still a NavBlock (click nav), salt only.

| | Effect | MemNav |
|--|--------|--------|
| Helper | `defineEffectBlock` | `defineMemNavBlock` |
| Spawns | mutate rows | navigate rows |
| `act` / nav | click Add/Remove | `click: (mem) => …` title link |
| Mem | same pattern: `requires` + row `key`/`value` | same |

Live source: `inventory/methods/add-to-cart.effect.block.ts`,
`inventory/nav-item-detail.block.ts`.

---

## Cart bulk: demo / run / auto

| | Command |
|--|---------|
| **Run (Block names)** | `npm run run:bulk` — `run --blocks "loginFlow then add-all…" --data '{…}'` |
| **Demo (named flow)** | `npm run demo:bulk` — `--blocks cartBulkFlow --data '{…}'` |
| **Demo QA video** | `npm run demo:bulk:video` — `--auto-play-video` |
| **Auto headed / CLI** | `npm run auto` / `auto:cli` |
| **Auto path-find** | `waygraph auto --blocks LoginPage OrderComplete` |


