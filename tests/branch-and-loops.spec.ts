import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { branch, runGraph, MemPage, checkpoint } from "../src/index.js";

const fakePage = { close: async () => {} } as unknown as import("@playwright/test").Page;
const fakeContext = { newPage: async () => fakePage } as any;

type Start = Checkpoint<"__start__">;
type Success = Checkpoint<"Success">;
type Failure = Checkpoint<"Failure">;

test.describe("branch()", () => {
  test("doesn't touch the original Block's instruction, only adds next", async () => {
    const original: Block<Start, Success> = {
      name: "original",
      instruction: { async act() {}, resolve: () => checkpoint("Success") },
    };

    const successBlock: Block<Success, Checkpoint<"Done">> = {
      name: "success",
      instruction: { async act() {}, resolve: () => checkpoint("Done") },
    };

    const routed = branch(original, { Success: successBlock });

    expect(routed.instruction).toBe(original.instruction);
    expect(routed.name).toBe(original.name);
    expect(routed.next).toBeDefined();
  });

  test("routes to different next Blocks depending on the resolved tag", async () => {
    let outcome: "won" | "lost" = "won";
    const calls: string[] = [];

    const gate: Block<Start, Success | Failure> = {
      name: "gate",
      instruction: {
        async act() {
          calls.push("gate.act");
        },
        resolve: () => checkpoint(outcome === "won" ? "Success" : "Failure"),
      },
    };

    const onSuccess: Block<Success, Checkpoint<"Celebrated">> = {
      name: "on-success",
      instruction: {
        async act() {
          calls.push("on-success.act");
        },
        resolve: () => checkpoint("Celebrated"),
      },
    };

    const onFailure: Block<Failure, Checkpoint<"Retried">> = {
      name: "on-failure",
      instruction: {
        async act() {
          calls.push("on-failure.act");
        },
        resolve: () => checkpoint("Retried"),
      },
    };

    const routed = branch(gate, { Success: onSuccess, Failure: onFailure });
    const mem = new MemPage();

    outcome = "won";
    const won = await runGraph(routed, undefined, fakeContext, mem);
    expect(won).toEqual(checkpoint("Celebrated"));
    expect(calls).toEqual(["gate.act", "on-success.act"]);

    calls.length = 0;
    outcome = "lost";
    const lost = await runGraph(routed, undefined, fakeContext, mem);
    expect(lost).toEqual(checkpoint("Retried"));
    expect(calls).toEqual(["gate.act", "on-failure.act"]);
  });
});

test.describe("self-loops and maxSteps", () => {
  test("a self-loop runs multiple times and terminates once it stops routing to itself", async () => {
    let count = 0;
    type Polling = Checkpoint<"Polling">;
    type Ready = Checkpoint<"Ready">;

    // In includes Polling (not just Start) - a self-looping Block is re-entered
    // with its own prior output tag, not always the graph's initial __start__.
    const poll: Block<Start | Polling, Polling | Ready> = {
      name: "poll",
      instruction: {
        async act() {
          count++;
        },
        resolve: () => checkpoint(count < 3 ? "Polling" : "Ready"),
      },
    };

    const routed = branch(poll, {
      Polling: poll, // self-loop
      Ready: null, // terminal
    });

    const result = await runGraph(routed, undefined, fakeContext, new MemPage());

    expect(count).toBe(3);
    expect(result).toEqual(checkpoint("Ready"));
  });

  test("an unintended infinite self-loop is caught by maxSteps", async () => {
    type Looping = Checkpoint<"Looping">;
    const loopy: Block<Start | Looping, Looping> = {
      name: "loopy",
      instruction: { async act() {}, resolve: () => checkpoint("Looping") },
    };

    const routed = branch(loopy, { Looping: loopy }); // never exits

    await expect(
      runGraph(routed, undefined, fakeContext, new MemPage(), 50),
    ).rejects.toThrow(/exceeded 50 steps/);
  });
});
