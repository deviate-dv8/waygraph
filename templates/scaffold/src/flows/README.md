# `src/flows/`

A flow is one **use case**: a path a user takes through the app, with its own pass or fail. `waygraph run`, `demo` and
`test` all point at an export here by name (`waygraph run --blocks homeCartFlow`).

## The folder mocks the front end

`src/flows/` mirrors the app's endpoints the way `src/map/` does, but where the map holds the *pieces* of a page, a flow
folder holds the *stories* of it. One folder per page or area, one file per use case. The scaffold only has the demo pages, so `auth/login/` below is the shape to copy for a real login page:

```text
src/flows/
  auth/login/
    success.flow.ts          # valid credentials -> dashboard
    wrong-password.flow.ts   # refused, error banner, stays on login
    empty-fields.flow.ts     # each required field flags itself
  home/
    hello.flow.ts
    cart.flow.ts
  (user-stories)/            # not a page: a story that crosses pages
    email-verification.flow.ts
  (external)/hoppscotch/     # a tool on another origin
    post.flow.ts
```

- **`<area>/<page>/`** matches the app URL, like the map. Open the folder and you see every way a user can go through that
  page: the happy path, each failure, each bad input.
- **`(user-stories)/`** (any `(group)` name) is for flows that don't belong to one page: checkout end to end, onboarding,
  "a viewer is locked out". Parentheses mean organizational only, as in the map.
- **A file is one scenario**, named for the outcome (`success`, `wrong-password`), not for the Blocks it happens to use.
  An export is `<page><Outcome>Flow` (`loginWrongPasswordFlow`) so `--blocks` names stay unique across the project; a file path works too (`waygraph run src/flows/auth/login/success.flow.ts`).

## Writing one

- Build it with `engine.map({ memStub })…end()`; nest another with `.flow(sub, { reset: true })`;
  `.end()` takes nothing.
- The flow's name and narration are ctx stubs chained on the Block where they apply: `ctx.ui.title("…")`, `ctx.ui.ring(…)`.
- A flow expected to fail (a locked-out user) says so in `map({ expectedFailure: "…" })`.
- A step's speed in the demo is `{ pace }`: `.method(FillBlock, { pace: "blitz" })`.
