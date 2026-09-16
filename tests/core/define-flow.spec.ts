import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import { Engine, start, end, MemPage, checkpoint } from "../../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;
type B = Checkpoint<"B">;
type C = Checkpoint<"C">;

test.describe("Engine.defineFlow", () => {
  test("a single-Block flow runs and returns that Block's output", async () => {
    const only: Block<Start, A> = {
      name: "only",
      instruction: { async act() {}, resolve: () => checkpoint("A") },
    };

    const engine = new Engine();
    const flow = engine.defineFlow([start, only, end]);

    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await flow.run(fakeContext, new MemPage());

    expect(result).toEqual(checkpoint("A"));
  });

  test("a multi-Block flow composes in order and returns the last Block's output", async () => {
    const calls: string[] = [];
    const blockA: Block<Start, A> = {
      name: "a",
      instruction: {
        async act() {
          calls.push("a");
        },
        resolve: () => checkpoint("A"),
      },
    };
    const blockB: Block<A, B> = {
      name: "b",
      instruction: {
        async act() {
          calls.push("b");
        },
        resolve: () => checkpoint("B"),
      },
    };
    const blockC: Block<B, C> = {
      name: "c",
      instruction: {
        async act() {
          calls.push("c");
        },
        resolve: () => checkpoint("C"),
      },
    };

    const engine = new Engine();
    const flow = engine.defineFlow([start, blockA, blockB, blockC, end]);

    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await flow.run(fakeContext, new MemPage());

    expect(result).toEqual(checkpoint("C"));
    expect(calls).toEqual(["a", "b", "c"]);
  });

  test("the max arity (7 real Blocks) typechecks and runs end to end", async () => {
    type D = Checkpoint<"D">;
    type E = Checkpoint<"E">;
    type F = Checkpoint<"F">;
    type G = Checkpoint<"G">;
    const calls: string[] = [];
    const make = <In extends Checkpoint<string>, Out extends Checkpoint<string>>(
      name: string,
      tag: Out["__state"],
    ): Block<In, Out> => ({
      name,
      instruction: {
        async act() {
          calls.push(name);
        },
        resolve: () => checkpoint(tag) as Out,
      },
    });

    const engine = new Engine();
    const flow = engine.defineFlow([
      start,
      make<Start, A>("a", "A"),
      make<A, B>("b", "B"),
      make<B, C>("c", "C"),
      make<C, D>("d", "D"),
      make<D, E>("e", "E"),
      make<E, F>("f", "F"),
      make<F, G>("g", "G"),
      end,
    ]);

    const fakeContext = { newPage: async () => fakePage } as any;
    const result = await flow.run(fakeContext, new MemPage());

    expect(result).toEqual(checkpoint("G"));
    expect(calls).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});
