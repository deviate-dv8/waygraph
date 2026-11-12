import { map, pane } from "waygraph";
import { NavApp, OpenAdmin } from "../map/app/app.block.js";
export const viewFlow = map().gotoPage(NavApp).gotoPage(NavApp);
export const adminFlow = map().gotoPage(NavApp).method(OpenAdmin).gotoPage(NavApp);
const Main = pane("main");
const Side = pane("side", { with: Main });
export const panesFlow = map({ panes: [Main, Side] }).in(Main).gotoPage(NavApp).in(Side).gotoPage(NavApp).in(Main).close(Side);
