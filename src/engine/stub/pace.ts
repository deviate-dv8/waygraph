// How fast a demo step plays.

/**
 * Demo pacing for a Flow episode or a Block/compose group.
 * - `blitz` - FF-like: skip theater + short gates (same as fastForwardComposeBlock)
 * - `fast` - shorter gates, keep cursor theater (~0.33x normal)
 * - `normal` - default demo pace (1x)
 * - `slow` - longer autoplay + fixture dwell (~2x)
 * - `number` - scale vs normal when `<= 20` (e.g. `0.5`, `1.5`, `3`);
 *   absolute gate/dwell ms when `> 20` (e.g. `4500`)
 */
export type DemoPaceName = "blitz" | "fast" | "normal" | "slow";

/** How fast a demo step runs: `"fast"`, `"slow"`, `"blitz"`, `"normal"`, or a multiplier (`0.5`, `2`). */
export type DemoPace = DemoPaceName | number;