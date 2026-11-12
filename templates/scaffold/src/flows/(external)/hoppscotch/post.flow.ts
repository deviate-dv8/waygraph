import { engine } from "#config/waygraph.config";
import { PickExtensionInterceptorBlock } from "#map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block";
import { OpenRestBlock } from "#map/(external)/hoppscotch/_methods/open-rest.method.block";
import { HoppscotchRestPage } from "#map/(external)/hoppscotch/_page.block";
import { HoppscotchSettingsPage } from "#map/(external)/hoppscotch/settings/_page.block";

/** POST JSON with a header, check the status and the response body. Needs `extensions: ["hoppscotch"]`. */
export const hoppscotchPostFlow = engine
  .map()
  .gotoExternal(
    HoppscotchSettingsPage.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch POST with header and JSON body");
    }),
  )
  .method(PickExtensionInterceptorBlock)
  .method(OpenRestBlock)
  .method(HoppscotchRestPage.do.setMethod)
  .method(HoppscotchRestPage.do.setUrl)
  .method(HoppscotchRestPage.do.setHeaders)
  .method(HoppscotchRestPage.do.setJsonBody)
  .method(HoppscotchRestPage.do.sendRequest, { expect: [HoppscotchRestPage.expects.status] })
  .method(HoppscotchRestPage.do.readResponseBody, { expect: [HoppscotchRestPage.expects.responseBody] });
