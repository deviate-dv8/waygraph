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
| `methods/fill-username.method.block.ts` | Method | Fills username only; self-loop on LoginPage |
| `methods/fill-password.method.block.ts` | Method | Fills password only; self-loop on LoginPage |
| `methods/submit-login.method.block.ts` | Method | Click Login only; branches LoggedIn vs LoginPage |
| `methods/submit-login-for-flow.ts` | helper | Typed alias for linear Flows |
| `methods/submit-logout.method.block.ts` | Method | Burger menu logout -> LoginPage |
| `methods/login.sel.ts` | helper | `LoginSel` (not a Block) |

Fill and submit are three separate Blocks (not one that fills both fields and
clicks Login) so the graph/demo show each as its own step - no Block does
more than one distinct action.

## Other

| File | Kind | Notes |
|------|------|-------|
| `ff-owner-auth.block.ts` | FFCompose | Collapses nav-login + fill-username + fill-password + submit-login into one opaque demo/run step (`--ff-expand` shows all 4 again) |

## Related mem keys / checkpoints

- Mem: `saucedemo.credentials` (`LoginCreds`)
- Checkpoints: `LoginPage`, `LoggedIn` (success path of submit-login)
- Sel: `LoginSel` (`methods/login.sel.ts`) - DOM only, not mem
