# waygraph 0.12.44 — what to look at

Live demo should be open now (headed Chromium):

```bash
waygraph demo --blocks loginFlow --mini --todo-right --auto-next --fast \
  --data '{"saucedemo.credentials":{"username":"standard_user","password":"secret_sauce"}}'
```

## On screen

| UI | What |
|---|---|
| Bottom pill | `--mini` collapsed stepper (`Ep N · step · block` + Next/Show) |
| Floating checklist | `#wg-todo-dock` on the **right** (`--todo-right`) — stays visible while mini |
| Top purple card | Banner text updates per stub: `Signing in` then `Inventory` (`ctx.title` / `ctx.banner`) |
| Episode chip | `Episode 1: Sign In` from `withTitle(loginFlow, "Sign In")` |
| Rings | Tone snaps instantly (no gray→purple→yellow morph) |

## Author it in fixtures

```ts
stubBefore: (ctx) => {
  ctx.title("Signing in");
  ctx.todoPos("right"); // left | right
  ctx.todos(["Enter username", "Enter password", "Click Login"]);
  ctx.todoIndex(0);
},

// Episode tab label (not the banner body):
withTitle(loginFlow, "Sign In")
```

Click the todo dock to slide left ↔ right. Click the banner to cycle left / center / right.

## Install

```bash
npm i waygraph@0.12.44
```

git: `5a3e031` · npm: `0.12.44`
