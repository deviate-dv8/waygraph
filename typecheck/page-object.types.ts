// The page object: `read` first, then `do` and `expects` as functions of the page, which sees the read's keys typed.
import { definePageBlock } from "../src/engine/block/kinds/page.js";
import { Trait } from "../src/engine/trait/trait.js";
import { defineMethodBlock } from "../src/engine/block/kinds/method.js";
import { checkpoint, type Checkpoint } from "../src/engine/checkpoint/checkpoint.js";

const Cart = checkpoint("Cart");
const Clear = defineMethodBlock({ name: "clear", from: Cart, to: Cart, instruction: { async act() {} } });

export const CartPage = definePageBlock({
  name: "page-cart",
  checkpoint: Cart,
  url: "/cart",
  read: (ctx) => ({ count: ctx.page.number(".count"), title: ctx.page.text("h1") }),
  do: () => ({ clear: Clear, again: () => Clear }),
  expects: (page) => ({ empty: page.read.count.is(0) }),
});

// Typed by what each field reads.
CartPage.read.count.is(3);
CartPage.read.title.is("Cart");
// @ts-expect-error - count is a number
CartPage.read.count.is("three");
// @ts-expect-error - no such field
CartPage.read.nothing;
CartPage.do.clear;
CartPage.expects.empty;

// A page with params in its address: go({ id }) is typed by them; one without has no go.
export const RequestPage = definePageBlock({ name: "page-request", checkpoint: checkpoint("PoRequest"), url: "/requests/:id/tab/[tab]" });
RequestPage.go({ id: 1, tab: "files" });
// @ts-expect-error - tab is missing
RequestPage.go({ id: 1 });
// @ts-expect-error - a page without params has no go
CartPage.go;

// Query params are page state: optional in go, changed by setQuery.
export const TabsPage = definePageBlock({ name: "page-tabs", checkpoint: checkpoint("PoTabs"), url: "/docs/:id", query: ["tab", "filter"] });
TabsPage.go({ id: 1 });
TabsPage.go({ id: 1, tab: "files" });
TabsPage.setQuery({ tab: "signers" });
// @ts-expect-error - not a query param of this page
TabsPage.setQuery({ nope: 1 });
// @ts-expect-error - a page without query has no setQuery
RequestPage.setQuery;

// A page that is its own Checkpoint, with Methods written inline: no states file, no from/to.
export const Account = definePageBlock({
  name: "page-account",
  checkpoint: "PoAccount",
  url: "/account",
  do: (page) => ({
    save: page.method({ async act() {} }),
    signOut: page.method({ to: "PoLoggedOut", async act() {} }),
    submit: page.method({ to: ["PoAccount", "PoErrored"], async act() {}, async lands() { return Math.random() > 0.5 ? ({ __state: "PoAccount" } as const) : ({ __state: "PoErrored" } as const); } }),
  }),
});
const _typed: Checkpoint<"PoAccount"> = Account.checkpoint;
void _typed;
Account.do.save;

// A Method in its own file takes the page's name only.
const signIn = (page: import("../src/engine/block/kinds/page.js").PageHandle<"PoSignIn">) => page.method({ to: "PoHome", async act() {} });
export const SignInPage = definePageBlock({ name: "page-po-sign-in", checkpoint: "PoSignIn", do: (page) => ({ signIn: signIn(page) }) });
SignInPage.do.signIn;

// An expectation written in the page: description + checks, no Expect Block file.
export const Shelf = definePageBlock({
  name: "page-po-shelf",
  checkpoint: "PoShelf",
  read: (ctx) => ({ rows: ctx.page.texts("li") }),
  expects: (page) => ({
    listed: page.expect({ description: "Rows are listed.", verify: [Trait.visible("li")] }),
    some: page.check("rows", ({ rows: r }) => r.length > 0),
  }),
});
Shelf.expects.listed;
Shelf.expects.some;

// A Method with params: typed arguments, a Block per call.
interface PoPoint { x: number; y: number }
export const Board = definePageBlock({
  name: "page-po-board",
  checkpoint: "PoBoard",
  do: (page) => ({
    drag: page.method((from: PoPoint, to: PoPoint) => ({ async act(p) { await p.mouse.move(from.x, from.y); await p.mouse.move(to.x, to.y); } })),
  }),
});
Board.do.drag({ x: 1, y: 2 }, { x: 3, y: 4 });
// @ts-expect-error - to is missing
Board.do.drag({ x: 1, y: 2 });
