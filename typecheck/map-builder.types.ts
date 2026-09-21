import type { Checkpoint } from "../src/types.js";
import {
  defineNavBlock,
  definePageBlock,
  defineAssertBlock,
  defineMethodBlock,
  map,
} from "../src/engine.js";

type Home = Checkpoint<"Home">;
type Cleared = Checkpoint<"Cleared">;

const NavHome = defineNavBlock<Home>({
  name: "nav-home",
  checkpoint: "Home",
  url: "https://app.example.com/home",
});
const PageHome = definePageBlock<Home>({
  name: "page-home",
  checkpoint: "Home",
  url: "https://app.example.com/home",
});
const AssertHome = defineAssertBlock<Home>({
  name: "assert-home",
  checkpoint: "Home",
  verify: [],
});
const ClearThing = defineMethodBlock<Home, Cleared>({
  name: "clear-thing",
  instruction: {
    async act() {},
    resolve: () => ({ __state: "Cleared" }),
  },
});

// Happy path - each step method accepts only its factory brand.
const _ok = map()
  .start()
  .gotoPage(NavHome)
  .assert(AssertHome)
  .method(ClearThing)
  .end();
void _ok;

const _okPage = map().start().gotoPage(PageHome).assert(AssertHome).end();
void _okPage;

// Decorate keeps the brand so stubBefore still typechecks into .method().
const _okDecorated = map()
  .start()
  .gotoPage(NavHome)
  .method(ClearThing.stubBefore(() => {}))
  .end();
void _okDecorated;

// Assert must not go through .method(); Method must not go through .assert().
// @ts-expect-error - AssertBlock is not a MethodBlock
map().start().gotoPage(NavHome).method(AssertHome);

// @ts-expect-error - MethodBlock is not an AssertBlock
map().start().gotoPage(NavHome).assert(ClearThing);

// @ts-expect-error - MethodBlock is not a Nav/Page Block
map().start().gotoPage(ClearThing);

// @ts-expect-error - AssertBlock is not a Nav/Page Block
map().start().gotoPage(AssertHome);

// @ts-expect-error - NavBlock is not an AssertBlock
map().start().assert(NavHome);

// @ts-expect-error - NavBlock is not a MethodBlock
map().start().gotoPage(NavHome).method(NavHome);
