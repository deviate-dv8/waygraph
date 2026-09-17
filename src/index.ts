export type { Checkpoint, Instruction, Block, DefinedBlock, Start, WaygraphInstanceOption } from "./types.js";
export { connect, checkpoint } from "./types.js";
export { MemKey, MemPage, key, keyGroup } from "./mem-page.js";
export { Trait, urlMatches, textEquals, visible } from "./trait.js";
export {
  runGraph,
  spawnTab,
  narrate,
  Engine,
  start,
  end,
  branch,
  withVerify,
  modVerify,
  modVerifyAll,
  defineBlock,
  defineNavBlock,
  defineNavClickBlock,
  defineMethodBlock,
  defineActionBlock,
  definePageBlock,
  defineEffectBlock,
  defineMemEffectBlock,
  defineMemNavBlock,
  locate,
  composeBlock,
  preflight,
  withSessionReset,
  withTitle,
  withExpectedFailure,
  withHighlightFixtures,
  chainFlow,
} from "./engine.js";
export {
  resolveHighlightSlots,
  resolveSlides,
  formatHighlightCaption,
  hasAuthoredStubAfter,
} from "./highlights.js";
export type {
  WaygraphHighlightStub,
  WaygraphHighlightFixture,
  WaygraphSlide,
  HighlightStubPhase,
  HighlightFixtureMap,
  ResolvedHighlight,
  WaygraphHighlight,
} from "./highlights.js";
export type {
  Flow,
  EngineConfig,
  ComposedBlock,
  RunGraphOptions,
  BlockInfo,
  NavBlock,
  NavBlockOptions,
  NavClickBlock,
  NavClickBlockOptions,
  MethodBlock,
  ActionBlock,
  PageBlock,
  PageBlockOptions,
  PageMethodEntry,
  EffectBlock,
  MemEffectBlock,
  MemNavBlock,
} from "./engine.js";
export type { ActionPage } from "./types.js";
export { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./graph.js";
export type { WaygraphGraph, WaygraphNode, WaygraphEdge, SkippedBlock, OrphanBlock } from "./graph.js";
