# demo-web / (synthetic home)

**URL:** `data:text/html,…` (offline hello - replace with your real `/`)

## Nav-to

| From | Block | How |
|------|-------|-----|
| start | `nav-home` | `defineNavBlock` `url` → data HTML |

## Methods

| Block | Kind | Notes |
|-------|------|-------|
| `assert-hello` | Method | Verify heading; demo stubs + fixtures |

## States / mem-keys

- Checkpoint `Home` after nav
- Checkpoint `HomeVerified` after assert-hello
