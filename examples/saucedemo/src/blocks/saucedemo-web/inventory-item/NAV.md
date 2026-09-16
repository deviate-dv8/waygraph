# inventory-item/ - URL `/inventory-item.html`

Single product detail page, plus nav edges that return to catalog
(continue shopping / back home / back to products).

## URL

- `/inventory-item.html` (detail)
- Related landings: `/inventory.html` (via back / continue-shopping clicks)

## Nav blocks

| File | Helper | Notes |
|------|--------|-------|
| `nav-continue-shopping.block.ts` | `defineNavBlock` | Cart "Continue Shopping" -> inventory |
| `nav-back-to-products.block.ts` | `defineNavBlock` | Order-complete "Back Home" -> inventory |
| `nav-back-to-inventory.block.ts` | `defineNavBlock` | Detail "Back to products" -> inventory |

## Effects / actions

(none on this route)

## Related mem keys / checkpoints

- Checkpoints: `ItemDetailPage`, `LoggedIn` (after back / continue), `OrderComplete` (from for back-to-products)
