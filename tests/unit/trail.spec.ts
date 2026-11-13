import { test } from "node:test";
import assert from "node:assert/strict";
import { Trail } from "../../src/engine/mem/trail.js";
import { ReadPage } from "../../src/engine/read/read-page.js";
import { ReadKey } from "../../src/engine/read/read-key.js";

const items = new ReadKey<string[]>("cart.items");
const title = new ReadKey<string>("item.title");
const look = (step: number, page: string, values: [string, unknown][], pane?: string) => ({ step, block: `b${step}`, page, ...(pane ? { pane } : {}), read: new ReadPage(new Map(values)) });

test("a trail answers what an earlier step saw, by key, whatever page it was on", () => {
  const trail = new Trail();
  trail.add(look(1, "Cart", [["cart.items", ["a"]]]));
  trail.add(look(4, "Item", [["item.title", "Created"]]));
  trail.add(look(6, "Cart", [["cart.items", ["a", "b"]]]));
  assert.deepEqual(trail.latest(items), ["a", "b"]);
  assert.deepEqual(trail.first(items), ["a"]);
  assert.equal(trail.at(4, title), "Created");
  assert.equal(trail.latest(title), "Created");
  assert.deepEqual(trail.changed(items), { from: ["a"], to: ["a", "b"] });
  assert.equal(trail.changed(title), undefined);
  assert.deepEqual(trail.all(items).map((s) => s.step), [1, 6]);
  assert.equal(trail.latest(new ReadKey<string>("nobody.saw")), undefined);
});

test("panes are told apart", () => {
  const trail = new Trail();
  trail.add(look(1, "Cart", [["cart.items", ["mine"]]], "standard"));
  trail.add(look(2, "Cart", [["cart.items", []]], "problem"));
  assert.deepEqual(trail.latest(items, { pane: "standard" }), ["mine"]);
  assert.deepEqual(trail.latest(items), []);
});
