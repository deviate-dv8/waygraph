// A part of a flow: steps written once, played by several flows with `.steps(part)`.
import type { SomeBlock } from "../block/some-block.js";
import type { Checkpoint } from "../checkpoint/checkpoint.js";
import type { MemKey } from "../mem/mem.js";
import { MapBuilder } from "./map-builder.js";

/**
 * Steps a flow plays as one part, from Checkpoint `In` to `Out`: made with {@link steps}, played with
 * `MapBuilder.steps()`.
 */
export interface Steps<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  /** Type-only: the Checkpoint the part starts on (a parameter, so only a flow on `In` takes it). Never set. */
  readonly __in?: (at: In) => void;
  /** Type-only: where the part ends. Never set. */
  readonly __out?: Out;
  readonly blocks: readonly SomeBlock[];
  readonly cleanup: readonly SomeBlock[];
  readonly provided: readonly MemKey<unknown>[];
}

/**
 * A part of a flow, written once and played by several (`.steps(part)`): the steps after `from`, as a flow writes them.
 * `from` is the Checkpoint the part starts on; the part is checked step by step, as a flow is.
 * @example
 * export const logDisruption = steps(DisruptionLog, (m) => m.method(SelectMachineBlock).method(FillShiftStartBlock).method(SubmitDisruptionBlock));
 * map({ as: Planner }).gotoPage(NavDisruptionLogBlock).steps(logDisruption).gotoPage(NavDisruptionLogBlock).steps(logDisruption)
 */
export function steps<In extends Checkpoint<string>, Out extends Checkpoint<string>>(_from: In, build: (m: MapBuilder<In>) => MapBuilder<Out>): Steps<In, Out> {
  return MapBuilder.part(build);
}
