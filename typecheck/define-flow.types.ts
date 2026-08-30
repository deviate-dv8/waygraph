import type { Checkpoint, Block } from "../src/types.js";
import { Engine, start, end } from "../src/engine.js";

type Start = Checkpoint<"__start__">;
type A = Checkpoint<"A">;
type B = Checkpoint<"B">;
type Unrelated = Checkpoint<"Unrelated">;

declare const blockA: Block<Start, A>;
declare const blockBadNext: Block<Unrelated, B>; // does not accept A - broken adjacency

const engine = new Engine();

const _validFlow = engine.defineFlow([start, blockA, end]);
void _validFlow;

// @ts-expect-error - blockBadNext's input "Unrelated" does not match blockA's output "A"
const _invalidFlow = engine.defineFlow([start, blockA, blockBadNext, end]);
void _invalidFlow;
