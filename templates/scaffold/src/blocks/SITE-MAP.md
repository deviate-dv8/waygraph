# Site map (scaffold)

Offline catalog uses one synthetic namespace (`demo-web/`) and a local
`home.html` fixture so `npm test` / `waygraph auto` need no network.

| Folder | URL | Notes |
|--------|-----|-------|
| `demo-web/` | `/` (synthetic) | Nav + Page hub + methods/effects |
| `demo-web/methods/` | same URL | assert, add/remove Effects, clear |

When you wire a real app, rename `demo-web/` to your FE origin namespace and
add one folder per real `page.tsx` route. See **Consumer layout** docs.
