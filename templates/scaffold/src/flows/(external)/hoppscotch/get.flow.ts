import { engine } from "#config/waygraph.config";
import { NavHoppscotchSettingsBlock } from "#map/(external)/hoppscotch/settings/_nav.block";
import { PickExtensionInterceptorBlock } from "#map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block";
import { HoppscotchRestPage } from "#map/(external)/hoppscotch/_page.block";

/** GET a URL and check the status. Needs `extensions: ["hoppscotch"]` in waygraph.config.ts. */
export const hoppscotchGetFlow = engine
  .map()
  .gotoExternal(
    NavHoppscotchSettingsBlock.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch GET");
    }),
  )
  .method(PickExtensionInterceptorBlock)
  .gotoExternal(HoppscotchRestPage.nav)
  .method(HoppscotchRestPage.do.setUrl)
  .method(HoppscotchRestPage.do.sendRequest)
  .assert(HoppscotchRestPage.do.assertStatus);
