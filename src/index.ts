// The runtime layer supplies how an Engine launches its own browser (config, Chromium path, extensions).
import "./runtime/launch.js";
export type { Checkpoint, Instruction, Block, DefinedBlock, Start, WaygraphInstanceOption } from "./core/types.js";
export { connect, checkpoint } from "./core/types.js";
export { MemKey, MemPage, key, keyGroup } from "./core/mem-page.js";
export { registerMemStub, seedMemStub, getMemStub } from "./core/mem-stub.js";
export { css, byText, byRole } from "./core/selector.js";
export { WaygraphError, WAYGRAPH_ERRORS } from "./core/errors.js";
export type { WaygraphErrorCode } from "./core/errors.js";
export {
  Trait,
  urlMatches,
  textEquals,
  visible,
  disabled,
  enabled,
  frameVisible,
  frameTextEquals,
  frameContainsText,
} from "./core/trait.js";
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
  defineAssertBlock,
  definePageBlock,
  defineEffectBlock,
  defineMemEffectBlock,
  defineMemNavBlock,
  defineApiBlock,
  locate,
  composeBlock,
  fastForwardComposeBlock,
  isFastForwardBlock,
  preflight,
  withSessionReset,
  withTitle,
  withMemStub,
  withDemoPace,
  withBlockPace,
  withHighlightStyle,
  withExpectedFailure,
  withHighlightFixtures,
  withStubBefore,
  withStubAfter,
  withStubOnError,
  withDialog,
  chainFlow,
  defineLayout,
  map,
  MapBuilder,
  branchRoutes,
  collectBranchFlows,
  runBranchRegression,
} from "./core.js";
export type { BranchEntry, BranchRunResult, RunBranchRegressionOptions } from "./core/branch-regression.js";
export type { ApiBlockOptions, ApiCallResult } from "./core/blocks/api.js";
export type { MapStepOpts, MapFlowOpts } from "./core/map-builder.js";
export {
  resolveHighlightSlots,
  resolveSlides,
  runStubPhase,
  resolveFixtureDwellMs,
  resolveSlideDwellMs,
  formatHighlightCaption,
  hasAuthoredStubAfter,
  hasAuthoredStubOnError,
  normalizeHighlightTone,
  normalizeDemoPace,
  normalizeHighlightSize,
  normalizeHighlightWeight,
  applyHighlightStyleDefaults,
  toneIconPrefix,
  resolveStepDemoPace,
  demoPaceScale,
  demoPaceIsBlitz,
  demoPaceIsFast,
  demoPaceIsSlow,
  demoPaceGateMs,
  formatDemoPaceBadge,
  formatDemoPaceLabel,
  normalizeTodos,
  normalizeTodoPos,
  normalizeTodoStyle,
  buildTodoDock,
  applyTodoPhase,
  advanceTodoDock,
  completeSequentialTodoDock,
  applyDevicePhase,
  resolveDeviceState,
  normalizeDevicePreset,
  normalizeDeviceOrientation,
  applyOrientation,
  orientationFromViewport,
  DEVICE_PRESETS,
  resolveTodoDockUi,
  FIXTURE_DURATION_MS_DEFAULT,
  FIXTURE_DURATION_FAST_MS_DEFAULT,
  FIXTURE_DURATION_SLOW_MS_DEFAULT,
  SLIDE_DURATION_MS_DEFAULT,
  SLIDE_DURATION_FAST_MS_DEFAULT,
  WAYGRAPH_RING_CSS,
} from "./highlights.js";
export type {
  WaygraphHighlightStub,
  WaygraphHighlightFixture,
  WaygraphSlide,
  WaygraphTodoItem,
  WaygraphTodoInput,
  WaygraphTodoGroup,
  WaygraphTodoGroupInput,
  WaygraphTodosOpts,
  TodoDockUiOpts,
  BannerPos,
  BannerUiOpts,
  TodoDockUiResolved,
  TodoDockState,
  TodoListStyle,
  FixtureDurationFields,
  HighlightStubPhase,
  HighlightStubPhaseName,
  HighlightFixtureMap,
  ResolvedHighlight,
  WaygraphHighlight,
  HighlightTone,
  HighlightSize,
  HighlightWeight,
  HighlightStyleDefaults,
  DemoPace,
  DemoPaceName,
  StubCtx,
  StubLifecycleFn,
  StubPhaseResult,
  StubPhaseFixtures,
  DevicePreset,
  DeviceViewport,
  DeviceState,
  DeviceOrientation,
} from "./highlights.js";
export type {
  Flow,
  FlowOptions,
  EngineConfig,
  ComposedBlock,
  FastForwardComposedBlock,
  RunGraphOptions,
  BlockInfo,
  NavBlock,
  NavBlockOptions,
  NavClickBlock,
  NavClickBlockOptions,
  MethodBlock,
  ActionBlock,
  AssertBlock,
  AssertBlockOptions,
  PageBlock,
  PageBlockOptions,
  PageMethodEntry,
  EffectBlock,
  MemEffectBlock,
  MemNavBlock,
  Layout,
  LayoutOptions,
  MapBuilderOptions,
} from "./core.js";
export type { ActionPage } from "./core/types.js";
export { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./analysis/graph.js";
export { buildManifest } from "./manifest/manifest.js";
export type { Manifest, ManifestBlock, ManifestFlow } from "./manifest/manifest.js";
export type { WaygraphGraph, WaygraphNode, WaygraphEdge, SkippedBlock, OrphanBlock } from "./analysis/graph.js";
export {
  isFileSelectToken,
  parseBlocksSelect,
  matchBlocksSelect,
  globToRegExp,
} from "./manifest/select.js";
export type { BlocksSelect, BlocksSelectKind } from "./manifest/select.js";
export { EdgeLeaseCoordinator } from "./traverse/lease.js";
export { runTraverse } from "./traverse/run.js";
export type {
  TraverseOptions,
  TraverseSessionMode,
  TraverseWorkerResult,
} from "./traverse/run.js";
export {
  buildCoverageReport,
  collectGraphEdgeKeys,
  defaultCoverageOutPath,
  formatCoverageLine,
  normalizeHitKey,
  parseMinEdgeCoverage,
  writeCoverageReport,
} from "./traverse/coverage.js";
export type { TraverseCoverageReport } from "./traverse/coverage.js";
export {
  WG_UI_SEL,
  WG_READY_PANEL_SEL,
  WG_READY_AUTO_SEL,
  WG_READY_BANNER_SEL,
  readWgOverlayBeacon,
  readWgOverlayBeaconInPage,
  assertWgOverlayReady,
} from "./session/overlay-beacon.js";
export type { WgModalKind, WgBeaconRow } from "./session/overlay-beacon.js";
export { AutoSession, stubFilePath } from "./auto-session.js";
export type {
  AutoSessionInit,
  SessionSnapshot,
  SessionSnapshotEdge,
  SessionSnapshotSection,
  ApplyPickResult,
  ApplyPathResult,
  TraceStep,
  ConsoleLogEntry,
  StorageSnapshot,
  ServiceWorkerRegistrationInfo,
  CookieInfo,
  StubFileKind,
} from "./auto-session.js";
export { pilotStart } from "./session/pilot.js";
export type { PilotStartResult } from "./session/pilot.js";
export { defineConfig, resolveBaseUrl } from "./runtime/config.js";
export type { WaygraphConfig, ConfigContext, VideoSettings, RunSettings, DemoSettings } from "./runtime/config.js";
export { withWebServer } from "./runtime/webserver.js";
export { chromiumExecutablePath } from "./runtime/browser.js";
export { resolveExtension, KNOWN_EXTENSIONS } from "./runtime/extensions.js";
export type { ExtensionSpec } from "./runtime/extensions.js";
export type { WebServerConfig } from "./runtime/webserver.js";
