import { Engine, Start, account, defineMethodBlock, Trait } from "waygraph";
import { App, serveApp } from "../app.js";

const engine = new Engine();
const signIn = (who: string) =>
  engine.map().method(
    defineMethodBlock({
      name: `sign-in-${who}`,
      from: Start,
      to: App,
      instruction: {
        async act(page) {
          await serveApp(page.context());
          await page.context().addCookies([{ name: "who", value: who, url: "https://app.test" }]);
          await page.goto("https://app.test/app");
        },
        verify: [Trait.visible("#app-title")],
      },
    }),
  );

export const Planner = account("planner", { signIn: signIn("planner") });
export const AdminUser = account("admin", { signIn: signIn("admin") });
