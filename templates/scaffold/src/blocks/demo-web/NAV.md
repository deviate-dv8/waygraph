# demo-web / (synthetic home)

**URL:** `http://127.0.0.1:4177/home.html` (offline catalog via `scripts/fixture-server.mjs` - replace with your real `/`)

## Nav-to

| From | Block | How |
|------|-------|-----|
| start | `nav-home` | `defineNavBlock` `url` → home.html |

## Page hub

| Block | Checkpoint | Methods |
|-------|------------|---------|
| `page-home` | `Home` | add-item, remove-item, clear-cart, assert-hello |

## Methods / Effects

| Block | Kind | Auto |
|-------|------|------|
| `assert-hello` | Method | single row |
| `add-item` | Effect | one row per live Add button (`instanceOptions`) |
| `remove-item` | Effect | one row per live Remove button |
| `clear-cart` | Method | single row |

## States / mem-keys

- Checkpoints: `Home`, `HomeVerified`, `ItemInCart`, `CartEmpty`
- Mem: `demo.selectedItem` (`SelectedItem`) - filled by auto or `--data`
