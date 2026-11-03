import { defineNavBlock } from "../src/engine/block/kinds/nav.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { definePageBlock } from "../src/engine/block/kinds/page.js";
import { defineAssertBlock, defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { map } from "../src/engine/engine.js";


const NavHome = defineNavBlock({
  name: "nav-home",
  checkpoint: checkpoint("Home"),
  url: "https://app.example.com/home",
});
const PageHome = definePageBlock({
  name: "page-home",
  checkpoint: checkpoint("Home"),
  url: "https://app.example.com/home",
});
const AssertHome = defineAssertBlock({
  name: "assert-home",
  checkpoint: checkpoint("Home"),
  verify: [],
});
const ClearThing = defineMethodBlock({
  name: "clear-thing",
  from: checkpoint("Home"),
  to: checkpoint("Cleared"),
  instruction: {
    async act() { },
    resolve: () => ({ __state: "Cleared" }),
  },
});

// Happy path - each step method accepts only its factory brand.
const _ok = map()
  .gotoPage(NavHome)
  .assert(AssertHome)
  .method(ClearThing);
void _ok;

const _okPage = map().gotoPage(PageHome).assert(AssertHome);
void _okPage;

// Decorate keeps the brand so stubBefore still typechecks into .method().
const _okDecorated = map()
  .gotoPage(NavHome)
  .method(ClearThing.stubBefore(() => {}));
void _okDecorated;

// Assert must not go through .method(); Method must not go through .assert().
// @ts-expect-error - AssertBlock is not a MethodBlock
map().gotoPage(NavHome).method(AssertHome);

// @ts-expect-error - MethodBlock is not an AssertBlock
map().gotoPage(NavHome).assert(ClearThing);

// @ts-expect-error - MethodBlock is not a Nav/Page Block
map().gotoPage(ClearThing);

// @ts-expect-error - AssertBlock is not a Nav/Page Block
map().gotoPage(AssertHome);

// @ts-expect-error - NavBlock is not an AssertBlock
map().assert(NavHome);

// @ts-expect-error - NavBlock is not a MethodBlock
map().gotoPage(NavHome).method(NavHome);
