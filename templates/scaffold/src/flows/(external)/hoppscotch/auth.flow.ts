import { engine } from "#config/waygraph.config";
import { NavHoppscotchSettingsBlock } from "#map/(external)/hoppscotch/settings/_nav.block";
import { PickExtensionInterceptorBlock } from "#map/(external)/hoppscotch/_methods/pick-extension-interceptor.method.block";
import { HoppscotchRestPage } from "#map/(external)/hoppscotch/_page.block";

/** GET with query params and a bearer token, check the status, that the API received them, and a response header. Needs `extensions: ["hoppscotch"]`. */
export const hoppscotchAuthFlow = engine
  .map()
  .gotoExternal(
    NavHoppscotchSettingsBlock.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch GET with query params and bearer token");
    }),
  )
  .method(PickExtensionInterceptorBlock)
  .gotoExternal(HoppscotchRestPage.nav)
  .method(HoppscotchRestPage.do.setUrl)
  .method(HoppscotchRestPage.do.setQueryParams)
  .method(HoppscotchRestPage.do.setBearerToken)
  .method(HoppscotchRestPage.do.sendRequest, { expect: [HoppscotchRestPage.expects.status] })
  .method(HoppscotchRestPage.do.readResponseBody, { expect: [HoppscotchRestPage.expects.responseBody] })
  .method(HoppscotchRestPage.do.readResponseHeaders, { expect: [HoppscotchRestPage.expects.responseHeader] });
