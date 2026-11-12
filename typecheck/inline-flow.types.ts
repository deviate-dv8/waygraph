import { definePageBlock } from "../src/engine/block/kinds/page.js";
import { map } from "../src/engine/engine.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { keys } from "../src/engine/mem/mem.js";

const K = keys("ifk")<{ c: { u: string } }>();
const LoginPage = checkpoint("IfLogin");
const P = definePageBlock({
  name: "page-if",
  checkpoint: LoginPage,
  do: (page) => ({
    a: page.method({ name: "x", description: "d", requires: [K.c], async act(p, _i, mem) { await p.locator(mem.get(K.c).u).fill("x"); } }),
    b: page.method({ async act() {} }),
  }),
});
export const f = map().gotoPage(P).method(P.do.a.stubBefore(() => undefined as never)).method(P.do.b.stubBefore(() => undefined as never));
