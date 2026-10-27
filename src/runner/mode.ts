// What every way of playing a flow shares: the steps, the open browser session, and the hooks a mode fills in around
// each step. `run` fills none, `demo` fills them with the waygraph UI, `report` records each step.
import type { BrowserContext } from "@playwright/test";
import type { Checkpoint } from "../engine/checkpoint/checkpoint.js";
import type { EngineConfig } from "../engine/config.js";
import type { MemPage } from "../engine/mem/mem.js";
import type { DemoPace } from "../engine/stub/pace.js";
import type { HighlightStyleDefaults } from "../engine/stub/ring.js";
import type { WgPage } from "../demo/types.js";
import type { SomeBlock } from "../engine/block/block.js";

/** One Block to play, with what its flow says about it. */
export interface PlayStep {
  block: SomeBlock;
  exportName: string;
  /** The engine config of the flow it came from (its layouts apply when it runs). */
  config: EngineConfig;
  /** Set on a named flow's steps; ad hoc Block chains have no episodes. */
  episodeNumber?: number | undefined;
  episodeTitle?: string | undefined;
  /** Clear cookies and storage before this step (a flow with `sessionReset`, chained after another). */
  resetSession: boolean;
  /** Seeds this segment's `--data` into mem; set on a segment's first step. */
  seedMem?: (() => void) | undefined;
  /** Set on a flow's last step when the flow is meant to fail (`map({ expectedFailure })`). */
  expectedFailureReason?: string | undefined;
  demoPace?: DemoPace | undefined;
  highlightStyle?: HighlightStyleDefaults | undefined;
  /** Which flow of the chain this step belongs to (its cleanup runs when that flow ends). */
  segment: number;
  /** A cleanup step (`.finally(Block)`): played when its flow ends, pass or fail; a failure is reported, not fatal. */
  cleanup?: boolean | undefined;
  /** An inner step of an expanded fast-forward unit (`--ff-expand`). */
  wasFastForward?: boolean | undefined;
  ffSource?: string | undefined;
}

/** The browser everything plays in. */
export interface PlaySession {
  context: BrowserContext;
  page: WgPage;
  mem: MemPage;
  baseURL: string | undefined;
}

/** How a step ended, for a mode's `failed` hook: it threw, or it landed on the branch its flow expects to fail on. */
export type StepFailure = { error: unknown; result?: undefined } | { error?: undefined; result: Checkpoint<string> };

export interface PlayOutcome {
  ok: boolean;
  result?: Checkpoint<string> | undefined;
  /** The step that failed, when one did. */
  failedAt?: { index: number; step: PlayStep; error: unknown } | undefined;
  /** Cleanup steps that failed (reported; they don't change `ok`). */
  cleanupFailures?: { step: PlayStep; error: unknown }[] | undefined;
  /** Set when the run stopped where its flow expects to fail. */
  expectedFailure?: { step: PlayStep; reason: string } | undefined;
}

/** A way of playing steps. Every hook is optional; with none, it is a plain Playwright run. */
export interface Mode {
  name: string;
  begin?(steps: readonly PlayStep[]): Promise<void>;
  /** After the page was reset between episodes. */
  afterReset?(): Promise<void>;
  before?(index: number): Promise<void>;
  after?(index: number, result: Checkpoint<string>, ms: number): Promise<void>;
  /** A step failed (or reached its expected failure): retry its episode, or stop. Without the hook: stop. */
  failed?(index: number, failure: StepFailure, ms: number): Promise<"retry" | "stop">;
  end?(outcome: PlayOutcome): Promise<void>;
}
