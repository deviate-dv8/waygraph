import { test, expect } from "@playwright/test";
import { checkpoint, MemPage, key } from "../../dist/index.js";
import { defineReadBlock, readCheckpoint, reads } from "../../dist/beta.js";
import { readSession, snapshotRead } from "../../dist/live/auto-session/read.js";

const PostOpen = checkpoint("PostOpen");
const OrdersPage = checkpoint("OrdersPage");

const Post = reads("post")<{
  title: string;
  likes: number;
  liked: boolean;
  tags: string[];
  error: string;
  author: { name: string; url: string };
  comments: { author: string; body: string; likes: number }[];
  draft: string;
  words: number;
}>();
const Shop = reads("shop")<{ orders: { id: string; total: string }[]; grid: { name: string; qty: string }[]; missingCol: { id: string; nope: string }[] }>();
const Session = reads("session")<{ user: string }>();

const POST_HTML = `
<header><span class="user">dan</span></header>
<article>
  <h1>  Why waygraph  </h1>
  <a class="author" href="/u/jd">J. Doe</a>
  <span class="likes">1,041 likes</span>
  <button class="like active">Like</button>
  <span class="tag">testing</span><span class="tag">playwright</span>
  <textarea id="draft">half a thought</textarea>
  <ul>
    <li class="comment"><b class="a">sam</b><p class="b">Nice</p><i class="l">3</i></li>
    <li class="comment"><b class="a">lee</b><p class="b">SPAs?</p><i class="l">0</i></li>
  </ul>
</article>`;

defineReadBlock({
  name: "read-post",
  from: PostOpen,
  instruction: {
    read: (ctx) =>
      Post({
        title: ctx.page.text("h1"),
        likes: ctx.page.number(".likes"),
        liked: ctx.page.visible(".like.active"),
        tags: ctx.page.texts(".tag"),
        error: ctx.page.text(".error"),
        author: { name: ctx.page.text(".author"), url: ctx.page.attr(".author", "href") },
        comments: ctx.page.list(".comment", (row) => ({ author: row.text(".a"), body: row.text(".b"), likes: row.number(".l") })),
        draft: ctx.page.value("#draft"),
        words: ctx.page.fn(async (page) => (await page.locator("h1").innerText()).trim().split(/\s+/).length),
      }),
  },
});
defineReadBlock({ name: "read-session", instruction: { read: (ctx) => Session({ user: ctx.page.text(".user") }) } });

test.describe("Read Blocks (beta)", () => {
  test("reads a page into a typed ReadPage, nested by key path", async ({ page }) => {
    await page.setContent(POST_HTML);
    const { read, blocks } = await readCheckpoint(page, new MemPage(), "PostOpen");
    // Other test files' in-process sessions can register Read Blocks in this worker too; check ours.
    expect(blocks).toEqual(expect.arrayContaining(["read-post", "read-session"]));
    expect(read.get(Post.title)).toBe("Why waygraph");
    expect(read.get(Post.likes)).toBe(1041);
    expect(read.get(Post.liked)).toBe(true);
    expect(read.get(Post.tags)).toEqual(["testing", "playwright"]);
    expect(read.get(Post.author)).toEqual({ name: "J. Doe", url: "/u/jd" });
    expect(read.get(Post.comments)).toEqual([
      { author: "sam", body: "Nice", likes: 3 },
      { author: "lee", body: "SPAs?", likes: 0 },
    ]);
    expect(read.get(Post.draft)).toBe("half a thought");
    expect(read.get(Post.words)).toBe(2);
    expect(read.get(Session.user)).toBe("dan");
    expect(read.toJSON()).toMatchObject({ post: { title: "Why waygraph", error: null }, session: { user: "dan" } });
  });

  test("a field the page does not show is missing, not an error, until you get it", async ({ page }) => {
    await page.setContent(POST_HTML);
    const { read } = await readCheckpoint(page, new MemPage(), "PostOpen");
    expect(read.missing.filter((p) => p.startsWith("post."))).toEqual(["post.error"]);
    expect(read.has(Post.error)).toBe(false);
    expect(() => read.get(Post.error)).toThrow(/"post.error" was not shown/);
  });

  test("only the every-page Read Blocks run where no Checkpoint is known", async ({ page }) => {
    await page.setContent(POST_HTML);
    const { read, blocks } = await readCheckpoint(page, new MemPage(), null);
    expect(blocks).toContain("read-session");
    expect(blocks).not.toContain("read-post");
    expect(read.toJSON()).toMatchObject({ session: { user: "dan" } });
    expect(read.toJSON()).not.toHaveProperty("post");
  });

  test("tables read by header text, HTML and ARIA grids, and say which column is not there", async ({ page }) => {
    defineReadBlock({
      name: "read-orders",
      from: OrdersPage,
      instruction: {
        read: (ctx) =>
          Shop({
            orders: ctx.page.table("#orders", { id: "Order #", total: "Total" }),
            grid: ctx.page.table("[role=grid]", { name: "Name", qty: "Qty" }),
            missingCol: ctx.page.table("#orders", { id: "Order #", nope: "Refund" }),
          }),
      },
    });
    await page.setContent(`
      <table id="orders"><thead><tr><th>Total</th><th>Order #</th></tr></thead>
        <tbody><tr><td>$10.00</td><td>A1</td></tr><tr><td>$7.50</td><td>A2</td></tr></tbody></table>
      <div role="grid" aria-rowcount="101">
        <div role="row"><div role="columnheader">Name</div><div role="columnheader">Qty</div></div>
        <div role="row"><div role="gridcell">Bolt</div><div role="gridcell">4</div></div>
      </div>`);
    const { read } = await readCheckpoint(page, new MemPage(), "OrdersPage");
    expect(read.get(Shop.orders)).toEqual([{ id: "A1", total: "$10.00" }, { id: "A2", total: "$7.50" }]);
    expect(read.get(Shop.grid)).toEqual([{ name: "Bolt", qty: "4" }]);
    expect(read.notes["shop.grid"]).toMatch(/1 of 100 rows rendered/);
    expect(read.notes["shop.missingCol"]).toMatch(/no column "Refund"/);
  });

  test("a Read Block that needs an unset Mem key is skipped, and says why", async ({ page }) => {
    const Pick = key<string>("read-test.pick");
    const Picked = reads("picked")<{ title: string }>();
    defineReadBlock({ name: "read-picked", from: checkpoint("PickPage"), requires: [Pick], instruction: { read: (ctx) => Picked({ title: ctx.page.text(`#${ctx.mem.get(Pick)}`) }) } });
    await page.setContent(`<h2 id="x">X marks</h2>`);
    const unset = await readCheckpoint(page, new MemPage(), "PickPage");
    expect(unset.skipped).toEqual([{ block: "read-picked", reason: "needs mem read-test.pick" }]);
    const mem = new MemPage();
    mem.set(Pick, "x");
    expect((await readCheckpoint(page, mem, "PickPage")).read.get(Picked.title)).toBe("X marks");
  });

  test("two Read Blocks reading one key on one page fail, naming both", async ({ page }) => {
    const Dup = reads("dup")<{ a: string }>();
    defineReadBlock({ name: "dup-one", from: checkpoint("DupPage"), instruction: { read: (ctx) => Dup({ a: ctx.page.text("h1") }) } });
    defineReadBlock({ name: "dup-two", from: checkpoint("DupPage"), instruction: { read: (ctx) => Dup({ a: ctx.page.text("h2") }) } });
    await page.setContent("<h1>a</h1>");
    await expect(readCheckpoint(page, new MemPage(), "DupPage")).rejects.toThrow(/"dup-one" and "dup-two" both read "dup.a"/);
  });

  test("a session read narrows to a path; a snapshot cuts long lists", async ({ page }) => {
    const Feed = reads("feed")<{ items: { t: string }[] }>();
    defineReadBlock({ name: "read-feed", from: checkpoint("FeedPage"), instruction: { read: (ctx) => Feed({ items: ctx.page.list("li", (row) => ({ t: row.text() })) }) } });
    await page.setContent(`<ul>${Array.from({ length: 30 }, (_, i) => `<li>item ${i}</li>`).join("")}</ul><span class="user">dan</span>`);
    const narrowed = await readSession(page, new MemPage(), "FeedPage", "feed.items");
    expect(narrowed.read).toEqual({ feed: { items: Array.from({ length: 30 }, (_, i) => ({ t: `item ${i}` })) } });
    const snap = await snapshotRead(page, new MemPage(), "FeedPage");
    expect((snap.read as { feed: { items: unknown[] } }).feed.items).toHaveLength(20);
    expect(snap.readNotes?.["feed.items"]).toMatch(/20 of 30 shown/);
    expect((await readSession(page, new MemPage(), "NowherePage")).read).toMatchObject({ session: { user: "dan" } });
  });

  test("a 1,000 x 8 table reads in one round trip", async ({ page }) => {
    const Big = reads("big")<{ rows: Record<"c0" | "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7", string>[] }>();
    const cols = { c0: "H0", c1: "H1", c2: "H2", c3: "H3", c4: "H4", c5: "H5", c6: "H6", c7: "H7" } as const;
    defineReadBlock({ name: "read-big", from: checkpoint("BigPage"), instruction: { read: (ctx) => Big({ rows: ctx.page.table("table", cols) }) } });
    await page.setContent("<table id=t></table>");
    await page.evaluate(() => {
      const t = document.getElementById("t")!;
      t.innerHTML = "<tr>" + Array.from({ length: 8 }, (_, c) => `<th>H${c}</th>`).join("") + "</tr>" +
        Array.from({ length: 1000 }, (_, r) => "<tr>" + Array.from({ length: 8 }, (_, c) => `<td>${r}-${c}</td>`).join("") + "</tr>").join("");
    });
    const started = Date.now();
    const { read } = await readCheckpoint(page, new MemPage(), "BigPage");
    const ms = Date.now() - started;
    expect(read.get(Big.rows)).toHaveLength(1000);
    expect(read.get(Big.rows)[999]!.c7).toBe("999-7");
    // ~70-150ms alone; one call per cell would be ~8,000 round trips and many seconds. Generous for a loaded CI box.
    expect(ms).toBeLessThan(2500);
  });
});

// Compile-time checks (never run): a reader must match its field's type; unknown fields are rejected.
export function typeChecks(ctx: import("../../dist/beta.js").ReadCtx): void {
  // @ts-expect-error likes is a number, ctx.text reads a string
  Post({ likes: ctx.page.text(".likes") });
  // @ts-expect-error no such field on Post
  Post({ nope: ctx.page.text("h1") });
  Post({ title: ctx.page.text("h1") }); // a page may read part of a namespace
  const n: number = Post.likes as unknown as number; void n;
}
