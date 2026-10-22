import type { StubCtx } from "waygraph";
import { LoginSel } from "../blocks/saucedemo-web/methods/login.sel.js";

/** What a refused login looks like on screen: the title, a finished checklist and the error banner. */
export function loginRefused(ctx: StubCtx): void {
  ctx.title("Login blocked");
  ctx.todos(
    "saucedemo",
    [
      { id: "login-user", text: "Enter username", done: true },
      { id: "login-pass", text: "Enter password", done: true },
      { id: "login-submit", text: "Click Login", done: true },
    ],
    { title: "Sign in", style: "checklist" },
  );
  ctx.ring("error", {
    selector: LoginSel.errorBanner,
    label: "Login error banner",
    detail: "tone: danger (red)",
    tone: "danger",
    focus: true,
    duration: true,
  });
}

/** Rings the error banner when the login step itself throws. */
export function loginFailed(ctx: StubCtx): void {
  ctx.title("Login failed");
  ctx.ring("error", {
    selector: LoginSel.errorBanner,
    label: "Login error banner",
    detail: "tone: danger (red)",
    tone: "danger",
    focus: true,
    duration: true,
  });
}
