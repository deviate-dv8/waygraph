# cart/ - URL `/cart.html`

Shopping cart page and checkout entry.

## URL

- `/cart.html`

## Nav blocks

| File | Helper | Notes |
|------|--------|-------|
| `nav-cart.block.ts` | `defineNavBlock` | Header cart link (`click`, not url) |
| `nav-checkout-info.block.ts` | `defineNavBlock` | "Checkout" button -> step one |

## Effects / actions

(none on this route; cart mutations live under `inventory/methods/`)

## Related mem keys / checkpoints

- Checkpoints: `CartPage`, `CheckoutInfoPage`, `ItemInCart` / `LoggedIn` (cart contents)
