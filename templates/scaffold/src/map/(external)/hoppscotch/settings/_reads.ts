import { reads } from "waygraph";

/** What Hoppscotch's settings show: whether the browser-extension interceptor is offered (the extension is installed). */
export const HoppscotchSettingsRead = reads("hoppscotchSettings")<{ extensionInterceptor: boolean }>();
