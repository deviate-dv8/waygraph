import { map } from "waygraph";
import { FillFirst, FillLast, NavForm } from "../map/home/home.block.js";
export const formFlow = map()
  .gotoPage(NavForm)
  .method(FillFirst.stubBefore((ctx) => ctx.ui.caption("Fill in the form")))
  .method(FillLast);
