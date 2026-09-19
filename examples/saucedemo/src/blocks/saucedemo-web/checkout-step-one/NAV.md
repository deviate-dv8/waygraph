# checkout-step-one/ - URL `/checkout-step-one.html`

Shipping info form before order overview.

## URL

- `/checkout-step-one.html`

## Nav blocks

(none - arrival is via `cart/nav-checkout-info.block.ts`)

## Effects / actions

| File | Kind | Notes |
|------|------|-------|
| `methods/fill-first-name.method.block.ts` | Method | Fills first name only; self-loop on CheckoutInfoPage |
| `methods/fill-last-name.method.block.ts` | Method | Fills last name only; self-loop on CheckoutInfoPage |
| `methods/fill-postal-code.method.block.ts` | Method | Fills postal code only; self-loop on CheckoutInfoPage |
| `methods/submit-checkout-info.method.block.ts` | Method | Click Continue only -> overview |
| `methods/checkout-info.sel.ts` | helper | `CheckoutInfoSel` (not a Block) |

## Related mem keys / checkpoints

- Checkpoints: `CheckoutInfoPage`, `CheckoutOverviewPage`
- Sel: `CheckoutInfoSel` (`methods/checkout-info.sel.ts`) - DOM only, not mem
