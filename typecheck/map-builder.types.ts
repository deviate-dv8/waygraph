import { defineNavBlock } from "../src/engine/block/kinds/nav.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { definePageBlock } from "../src/engine/block/kinds/page.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { defineExpectBlock } from "../src/engine/block/kinds/expect.js";
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
const AssertHome = defineExpectBlock({
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
const _ok = map().gotoPage(NavHome, { expect: [AssertHome] })
  .method(ClearThing);
void _ok;

const _okPage = map().gotoPage(PageHome, { expect: [AssertHome] });
void _okPage;

// Decorate keeps the brand so stubBefore still typechecks into .method().
const _okDecorated = map()
  .gotoPage(NavHome)
  .method(ClearThing.stubBefore(() => {}));
void _okDecorated;

// An Expect Block is not a step; a Method is not an expectation.
// @ts-expect-error - an ExpectBlock is not a MethodBlock
map().gotoPage(NavHome).method(AssertHome);

// @ts-expect-error - a MethodBlock is not an expectation
map().gotoPage(NavHome, { expect: [ClearThing] });

// @ts-expect-error - MethodBlock is not a Nav/Page Block
map().gotoPage(ClearThing);

// @ts-expect-error - an ExpectBlock is not a Nav/Page Block
map().gotoPage(AssertHome);

// @ts-expect-error - a NavBlock is not an expectation
map().gotoPage(NavHome, { expect: [NavHome] });

// @ts-expect-error - NavBlock is not a MethodBlock
map().gotoPage(NavHome).method(NavHome);
