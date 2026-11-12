import { checkpoint, defineMethodBlock, defineNavBlock, defineReadBlock, reads, Trait } from "waygraph";
export const App = checkpoint("App");
export const NavApp = defineNavBlock({ name: "nav-app", checkpoint: App, url: "file:///home/dan/Desktop/Projects/waygraph/tests/cli/.tmp-compare/index.html", verify: [Trait.visible("#title")] });
export const SignInAs = (role: string) => defineNavBlock({ name: "sign-in-" + role, checkpoint: App, url: "file:///home/dan/Desktop/Projects/waygraph/tests/cli/.tmp-compare/index.html" + "?role=" + role });
export const OpenAdmin = defineMethodBlock({
  name: "open-admin",
  from: App,
  to: App,
  instruction: { async act(page) { await page.locator("#admin").click({ timeout: 2000 }); } },
});
export const Screen = reads("screen")<{ width: number }>();
export const ReadApp = defineReadBlock({ name: "read-app", from: [App], instruction: { read: (ctx) => Screen({ width: ctx.page.number("#width") }) } });
