# saucedemo-web/ - URL `/`

Login page for Swag Labs. This folder is the namespace root (`/` in the browser).

## URL

- `/` (login form)

## Nav blocks

| File | Helper | Notes |
|------|--------|-------|
| `nav-login.block.ts` | `defineNavBlock` | `url: "/"` - only goto onto login |

## Effects / actions

| File | Kind | Notes |
|------|------|-------|
| `methods/submit-login.method.block.ts` | Method | Form submit; branches LoggedIn vs LoginPage |
| `methods/submit-login-for-flow.ts` | helper | Typed alias for linear Flows |
| `methods/submit-logout.method.block.ts` | Method | Burger menu logout -> LoginPage |

## Related mem keys / checkpoints

- Mem: `saucedemo.credentials` (`LoginCreds`)
- Checkpoints: `LoginPage`, `LoggedIn` (success path of submit-login)
