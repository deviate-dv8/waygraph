import { engine } from "#config/waygraph.config";
import { HoppscotchRestPage } from "#map/(external)/hoppscotch/_page.block";
import { HoppscotchSettingsPage } from "#map/(external)/hoppscotch/settings/_page.block";

/** GET a URL and check the status. Needs `extensions: ["hoppscotch"]` in waygraph.config.ts. */
export const hoppscotchGetFlow = engine
  .map({ title: "Hoppscotch GET", description: "Send a GET and check the status.", labels: ["api"] })
  .gotoExternal(
    HoppscotchSettingsPage.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch GET");
    }),
  )
  .method(HoppscotchSettingsPage.do.pickExtensionInterceptor)
  .method(HoppscotchSettingsPage.do.openRest)
  .method(HoppscotchRestPage.do.setUrl)
  .method(HoppscotchRestPage.do.sendRequest, { expect: [HoppscotchRestPage.expects.status] });
