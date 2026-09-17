# Site map (scaffold)

Offline hello uses one synthetic namespace (`demo-web/`) and a `data:` home URL
so `npm test` stays green without the network.

| Folder | URL | Notes |
|--------|-----|-------|
| `demo-web/` | `/` (synthetic) | Nav + methods for the hello page |
| `demo-web/methods/` | same URL | On-page asserts / future form acts |

When you wire a real app, rename `demo-web/` to your FE origin namespace and
add one folder per real `page.tsx` route. Grouping dirs without a page get no
`NAV.md`. Full contract: waygraph **Consumer layout** docs.
