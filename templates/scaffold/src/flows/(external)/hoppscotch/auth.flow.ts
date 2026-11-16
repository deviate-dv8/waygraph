import { engine } from "#config/waygraph.config";
import { HoppscotchRestPage } from "#map/(external)/hoppscotch/_page.block";
import { HoppscotchSettingsPage } from "#map/(external)/hoppscotch/settings/_page.block";

/** GET with query params and a bearer token, check the status, that the API received them, and a response header. Needs `extensions: ["hoppscotch"]`. */
export const hoppscotchAuthFlow = engine
  .map({ title: "Hoppscotch GET with a token", description: "GET with query params and a bearer token; check the status, the body and a response header.", labels: ["api"] })
  .gotoExternal(
    HoppscotchSettingsPage.stubBefore((ctx) => {
      ctx.ui.title("Scaffold: Hoppscotch GET with query params and bearer token");
    }),
  )
  .method(HoppscotchSettingsPage.do.pickExtensionInterceptor)
  .method(HoppscotchSettingsPage.do.openRest)
  .method(HoppscotchRestPage.do.setUrl)
  .method(HoppscotchRestPage.do.setQueryParams)
  .method(HoppscotchRestPage.do.setBearerToken)
  .method(HoppscotchRestPage.do.sendRequest, { expect: [HoppscotchRestPage.expects.status] })
  .method(HoppscotchRestPage.do.readResponseBody, { expect: [HoppscotchRestPage.expects.responseBody] })
  .method(HoppscotchRestPage.do.readResponseHeaders, { expect: [HoppscotchRestPage.expects.responseHeader] });
