# inventory/ - URL `/inventory.html`

Product catalog after a successful login.

## URL

- `/inventory.html`

## Page hub

| File | Helper | Notes |
|------|--------|-------|
| `inventory.page.block.ts` | `definePageBlock` | Hub `LoggedIn`; registers add/remove/open methods; `InventorySel` for DOM |

## Nav blocks

| File | Helper | Notes |
|------|--------|-------|
| `nav-item-detail.block.ts` | `defineMemNavBlock` | Opens mem-picked product detail; instance rows per card |

## Methods

| File | Kind | Notes |
|------|------|-------|
| `methods/add-to-cart.effect.block.ts` | Effect | Add mem-picked item; instance menu |
| `methods/remove-from-cart.effect.block.ts` | Effect | Remove mem-picked item; may empty cart |
| `methods/add-all-to-cart.method.block.ts` | Method | Bulk add every Add button; one menu row |
| `methods/remove-all-from-cart.method.block.ts` | Method | Bulk remove every Remove button; one menu row |
| `methods/inventory-items.ts` | helper | `InventorySel` + DOM collectors (not a Block) |

## Related mem keys / checkpoints

- Mem: `saucedemo.selectedItem` (`SelectedItem`) - per-item Effects only
- Checkpoints: `LoggedIn`, `ItemInCart`, `ItemDetailPage` (via MemNav)
- Sel: `InventorySel` (DOM only — not mem)
- Round-trip: cart Methods/Effects use `In = Checkpoint<string>` (`from: "*"`).
  Auto menu follows live Add/Remove buttons after leave/return; URL sniff on
  `/inventory.html` still reports `LoggedIn` (same URL; cart is status).
