// The runtime layer supplies how an Engine launches its own browser (config, Chromium path, extensions).
import "./runtime/launch.js";
// Run events are written to the project's run log (.waygraph/runs) when the CLI turns it on.
import "./runtime/run-log.js";
export type { Checkpoint, Start } from "./engine/checkpoint/checkpoint.js";
export type { Instruction, Block, DefinedBlock, WaygraphInstanceOption } from "./engine/block/block.js";
export { connect } from "./engine/run/connect.js";
export { checkpoint } from "./engine/checkpoint/checkpoint.js";
export { MemKey, MemPage, key, keyGroup } from "./engine/mem/mem.js";
export { registerMemStub, seedMemStub, getMemStub } from "./engine/mem/mem-stub.js";
export { css, byText, byRole } from "./engine/trait/selector.js";
export { WaygraphError, WAYGRAPH_ERRORS } from "./engine/errors.js";
export type { WaygraphErrorCode } from "./engine/errors.js";
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
} from "./engine/trait/trait.js";
export { runGraph, spawnTab, narrate, preflight, defineLayout } from "./engine/run/run.js";
export { Engine, map } from "./engine/engine.js";
export { branch, withVerify, modVerify, modVerifyAll, defineBlock, withDialog } from "./engine/block/block.js";
export { defineNavBlock, defineNavClickBlock, defineMemNavBlock } from "./engine/block/kinds/nav.js";
export { defineMethodBlock, defineAssertBlock } from "./engine/block/kinds/method.js";
export { definePageBlock } from "./engine/block/kinds/page.js";
export { defineEffectBlock } from "./engine/block/kinds/effect.js";
export { defineApiBlock } from "./engine/block/kinds/api.js";
export { locate } from "./engine/locate.js";
export { composeBlock, fastForwardComposeBlock, isFastForwardBlock } from "./engine/block/compose.js";
export { MapBuilder } from "./engine/flow/map-builder.js";
export { branchRoutes, collectBranchFlows, runBranchRegression } from "./engine/flow/branch-regression.js";
export type { BranchEntry, BranchRunResult, RunBranchRegressionOptions } from "./engine/flow/branch-regression.js";
export type { ApiBlockOptions, ApiCallResult } from "./engine/block/kinds/api.js";
export type { MapStepOpts, MapFlowOpts } from "./engine/flow/map-builder.js";
export { resolveHighlightSlots, resolveSlides, runStubPhase, hasAuthoredStubAfter, hasAuthoredStubOnError } from "./demo/narration/narration.js";
export { resolveFixtureDwellMs, normalizeDemoPace, resolveStepDemoPace, demoPaceScale, demoPaceIsBlitz, demoPaceIsFast, demoPaceIsSlow, demoPaceGateMs, formatDemoPaceBadge, formatDemoPaceLabel, FIXTURE_DURATION_MS_DEFAULT, FIXTURE_DURATION_FAST_MS_DEFAULT, FIXTURE_DURATION_SLOW_MS_DEFAULT } from "./demo/narration/demo-pace.js";
export { formatHighlightCaption, applyHighlightStyleDefaults, toneIconPrefix } from "./demo/narration/style.js";
export { normalizeHighlightTone, normalizeHighlightSize, normalizeHighlightWeight } from "./engine/narration.js";
export { normalizeTodos, normalizeTodoPos, normalizeTodoStyle, buildTodoDock, applyTodoPhase, advanceTodoDock, completeSequentialTodoDock, resolveTodoDockUi } from "./demo/narration/todo-dock.js";
export { applyDevicePhase, resolveDeviceState, normalizeDevicePreset, normalizeDeviceOrientation, applyOrientation, orientationFromViewport, DEVICE_PRESETS } from "./demo/narration/device.js";
export { WAYGRAPH_RING_CSS } from "./demo/narration/css.js";
export type { WaygraphHighlightStub, WaygraphSlide, WaygraphTodoItem, WaygraphTodoInput, WaygraphTodoGroup, WaygraphTodoGroupInput, WaygraphTodosOpts, TodoDockUiOpts, BannerPos, BannerUiOpts, TodoDockUiResolved, TodoDockState, TodoListStyle, FixtureDurationFields, HighlightStubPhase, HighlightStubPhaseName, ResolvedHighlight, HighlightTone, HighlightSize, HighlightWeight, HighlightStyleDefaults, DemoPace, DemoPaceName, StubCtx, StubLifecycleFn, StubPhaseResult, StubPhaseFixtures, DevicePreset, DeviceViewport, DeviceState, DeviceOrientation } from "./engine/narration.js";
export type { Flow, BlockInfo } from "./engine/flow/flow.js";
export type { EngineConfig } from "./engine/config.js";
export type { ComposedBlock, FastForwardComposedBlock } from "./engine/block/compose.js";
export type { RunGraphOptions, Layout, LayoutOptions } from "./engine/run/run.js";
export type { NavBlock, NavBlockOptions, NavClickBlock, NavClickBlockOptions, MemNavBlock } from "./engine/block/kinds/nav.js";
export type { MethodBlock, AssertBlock, AssertBlockOptions } from "./engine/block/kinds/method.js";
export type { PageBlock, PageBlockOptions, PageMethodEntry } from "./engine/block/kinds/page.js";
export type { EffectBlock } from "./engine/block/kinds/effect.js";
export type { MapBuilderOptions } from "./engine/flow/map-builder.js";
export type { ActionPage } from "./engine/block/block.js";
export { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./analysis/graph.js";
export { buildManifest } from "./manifest/manifest.js";
export { onRunEvent } from "./engine/run/events.js";
export type { RunEvent } from "./engine/run/events.js";
export type { Manifest, ManifestBlock, ManifestFlow } from "./manifest/manifest.js";
export type { WaygraphGraph, WaygraphNode, WaygraphEdge, SkippedBlock, OrphanBlock } from "./analysis/graph.js";
export {
  isFileSelectToken,
  parseBlocksSelect,
  matchBlocksSelect,
  globToRegExp,
} from "./manifest/select.js";
export type { BlocksSelect, BlocksSelectKind } from "./manifest/select.js";
export { EdgeLeaseCoordinator } from "./live/traverse/lease.js";
export { runTraverse } from "./live/traverse/traverse.js";
export type {
  TraverseOptions,
  TraverseSessionMode,
  TraverseWorkerResult,
} from "./live/traverse/traverse.js";
export {
  buildCoverageReport,
  collectGraphEdgeKeys,
  defaultCoverageOutPath,
  formatCoverageLine,
  normalizeHitKey,
  parseMinEdgeCoverage,
  writeCoverageReport,
} from "./live/traverse/coverage.js";
export type { TraverseCoverageReport } from "./live/traverse/coverage.js";
export {
  WG_UI_SEL,
  WG_READY_PANEL_SEL,
  WG_READY_AUTO_SEL,
  WG_READY_BANNER_SEL,
  readWgOverlayBeacon,
  readWgOverlayBeaconInPage,
  assertWgOverlayReady,
} from "./live/overlay-beacon.js";
export type { WgModalKind, WgBeaconRow } from "./live/overlay-beacon.js";
export { AutoSession } from "./live/auto-session/auto-session.js";
export { stubFilePath } from "./live/auto-session/helpers.js";
export type { AutoSessionInit, SessionSnapshot, SessionSnapshotEdge, SessionSnapshotSection, ApplyPickResult, ApplyPathResult, TraceStep, ConsoleLogEntry, StorageSnapshot, ServiceWorkerRegistrationInfo, CookieInfo, StubFileKind } from "./live/auto-session/helpers.js";
export { pilotStart } from "./live/pilot.js";
export type { PilotStartResult } from "./live/pilot.js";
export { defineConfig, resolveBaseUrl } from "./runtime/config.js";
export type { WaygraphConfig, ConfigContext, VideoSettings, RunSettings, DemoSettings } from "./runtime/config.js";
export { withWebServer } from "./runtime/webserver.js";
export { chromiumExecutablePath } from "./runtime/browser.js";
export { resolveExtension, KNOWN_EXTENSIONS } from "./runtime/extensions.js";
export type { ExtensionSpec } from "./runtime/extensions.js";
export type { WebServerConfig } from "./runtime/webserver.js";
