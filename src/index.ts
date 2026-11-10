import { installFullLaunch } from "./runtime/full-launch.js";
import { installRunLog } from "./runtime/run-log.js";

// The package entry wires the runtime in, explicitly: how an Engine launches its own browser (config, Chromium path,
// extensions), and the run log (.waygraph/runs) the CLI turns on. No module switches itself on by being imported.
installFullLaunch();
installRunLog();
export { Start } from "./engine/checkpoint/checkpoint.js";
export type { Checkpoint } from "./engine/checkpoint/checkpoint.js";
export type { Instruction, Block, BlockOut, DefinedBlock, StepScreenshot } from "./engine/block/block.js";
export type { BlockFrom, SomeBlock, SomeDefinedBlock, SomeInstruction } from "./engine/block/some-block.js";
export type { WaygraphInstanceOption } from "./engine/block/action-page.js";
export { connect } from "./engine/run/connect.js";
export { checkpoint } from "./engine/checkpoint/checkpoint.js";
export { MemKey, MemPage, keys } from "./engine/mem/mem.js";
export type { KeyNamespace } from "./engine/mem/mem.js";
export { registerMemStub, seedMemStub, getMemStub } from "./engine/mem/mem-stub.js";
export type { MemStubContext } from "./engine/mem/mem-stub.js";
export { css, byText, byRole } from "./engine/trait/selector.js";
export { WaygraphError, WAYGRAPH_ERRORS } from "./engine/errors.js";
export type { WaygraphErrorCode } from "./engine/errors.js";
export { Trait, urlMatches, textEquals, visible, disabled, enabled, frameVisible, frameTextEquals, frameContainsText } from "./engine/trait/trait.js";
export type { TraitResult, Expected } from "./engine/trait/trait.js";
export { TraitFailure } from "./engine/trait/verify.js";
export type { TraitCheckReport } from "./engine/trait/verify.js";
export { runGraph, spawnTab, preflight } from "./engine/run/run.js";
export { ExpectFailure } from "./engine/run/expect.js";
export { Engine, map } from "./engine/engine.js";
export { branch } from "./engine/block/branch.js";
export { withVerify, modVerify, modVerifyAll, defineBlock } from "./engine/block/block.js";
export { withDialog } from "./engine/block/dialog.js";
export { defineNavBlock, defineNavClickBlock, defineMemNavBlock } from "./engine/block/kinds/nav.js";
export { defineMethodBlock } from "./engine/block/kinds/method.js";
export { defineExpectBlock } from "./engine/block/kinds/expect.js";
export { definePageBlock } from "./engine/block/kinds/page.js";
export { defineLayout } from "./engine/block/kinds/layout.js";
export type { Layout, LayoutLink, LayoutOptions, LinkNav } from "./engine/block/kinds/layout.js";
export { defineApiBlock } from "./engine/block/kinds/api.js";
export { locate } from "./engine/locate.js";
export { composeBlock, fastForwardComposeBlock, isFastForwardBlock } from "./engine/block/compose.js";
export { MapBuilder } from "./engine/flow/map-builder.js";
export { steps } from "./engine/flow/map-part.js";
export { account, forgetSessions } from "./engine/flow/account.js";
export type { Account } from "./engine/flow/account.js";
export type { Fault, Throttle, World } from "./engine/flow/world.js";
export { claimOnce } from "./engine/claim.js";
export { branchRoutes, collectBranchFlows, runBranchRegression } from "./engine/flow/branch-regression.js";
export type { BranchEntry, BranchRunResult, RunBranchRegressionOptions } from "./engine/flow/branch-regression.js";
export type { ApiBlockOptions, ApiCallResult } from "./engine/block/kinds/api.js";
export type { MapStepOpts } from "./engine/flow/map-steps.js";
export type { MapFlowOpts, WhenOpt } from "./engine/flow/map-builder.js";
export type { Steps } from "./engine/flow/map-part.js";
export { resolveHighlightSlots, runStubPhase, hasAuthoredStubAfter, hasAuthoredStubOnError } from "./demo/narration/narration.js";
export { resolveFixtureDwellMs, normalizeDemoPace, resolveStepDemoPace, demoPaceScale, demoPaceIsBlitz, demoPaceIsFast, demoPaceIsSlow, demoPaceGateMs, formatDemoPaceBadge, formatDemoPaceLabel, FIXTURE_DURATION_MS_DEFAULT, FIXTURE_DURATION_FAST_MS_DEFAULT, FIXTURE_DURATION_SLOW_MS_DEFAULT } from "./demo/narration/demo-pace.js";
export { formatHighlightCaption, applyHighlightStyleDefaults, toneIconPrefix } from "./demo/narration/style.js";
export { normalizeHighlightTone, normalizeHighlightSize, normalizeHighlightWeight } from "./engine/stub/ring.js";
export { normalizeTodos, normalizeTodoPos, normalizeTodoStyle, buildTodoDock, applyTodoPhase, advanceTodoDock, completeSequentialTodoDock, resolveTodoDockUi } from "./demo/narration/todo-dock.js";
export { applyDevicePhase, resolveDeviceState, normalizeDevicePreset, normalizeDeviceOrientation, applyOrientation, orientationFromViewport, DEVICE_PRESETS } from "./demo/narration/device.js";
export type { WaygraphHighlightStub, WaygraphSlide, FixtureDurationFields, HighlightStubPhase, ResolvedHighlight, HighlightTone, HighlightSize, HighlightWeight, HighlightStyleDefaults } from "./engine/stub/ring.js";
export type { WaygraphTodoItem, WaygraphTodoInput, WaygraphTodoGroup, WaygraphTodoGroupInput, WaygraphTodosOpts, TodoDockUiOpts, TodoDockUiResolved, TodoDockState, TodoListStyle } from "./engine/stub/todos.js";
export type { BannerPos, BannerUiOpts, HighlightStubPhaseName, StubCtx, StubLifecycleFn, StubPhaseResult, StubPhaseFixtures, StubUi } from "./engine/stub/stub.js";
export type { DemoPace, DemoPaceName } from "./engine/stub/pace.js";
export type { DevicePreset, DeviceViewport, DeviceState, DeviceOrientation } from "./engine/stub/viewport.js";
export type { Device, DeviceName, DeviceOptions } from "./engine/flow/device.js";
export type { Flow, BlockInfo } from "./engine/flow/flow.js";
export type { EngineConfig } from "./engine/config.js";
export type { ComposedBlock, FastForwardComposedBlock, SomeComposedBlock, SomeFastForwardBlock } from "./engine/block/compose.js";
export type { RunGraphOptions } from "./engine/run/run.js";
export type { NavBlock, NavBlockOptions, NavClickBlock, NavClickBlockOptions, MemNavBlock } from "./engine/block/kinds/nav.js";
export type { MethodBlock, MethodBlockOptions } from "./engine/block/kinds/method.js";
export type { Expectation, ExpectBlock, ExpectBlockOptions, ExpectList } from "./engine/block/kinds/expect.js";
export type { PageBlock, PageBlockOptions, PageExpectEntry, PageMethodEntry, PageMethods } from "./engine/block/kinds/page.js";
export type { MapBuilderOptions } from "./engine/flow/map-builder.js";
export type { ActionPage } from "./engine/block/action-page.js";
export { discoverGraph, toMermaid, findOrphanBlocks, findBlockPath } from "./analysis/graph.js";
export { buildManifest } from "./manifest/manifest.js";
export { onRunEvent } from "./engine/run/events.js";
export type { RunEvent, StepRead } from "./engine/run/events.js";
export type { Manifest, ManifestBlock, ManifestFlow, ManifestReadBlock } from "./manifest/manifest.js";
export type { WaygraphGraph, WaygraphNode, WaygraphEdge, SkippedBlock, OrphanBlock } from "./analysis/graph.js";
export { isFileSelectToken, parseBlocksSelect, matchBlocksSelect } from "./manifest/select.js";
export type { BlocksSelect, BlocksSelectKind } from "./manifest/select.js";
export { EdgeLeaseCoordinator } from "./live/traverse/lease.js";
export { runTraverse } from "./live/traverse/traverse.js";
export type { TraverseOptions, TraverseSessionMode, TraverseWorkerResult } from "./live/traverse/traverse.js";
export { buildCoverageReport, collectGraphEdgeKeys, defaultCoverageOutPath, formatCoverageLine, normalizeHitKey, parseMinEdgeCoverage, writeCoverageReport } from "./live/traverse/coverage.js";
export type { TraverseCoverageReport } from "./live/traverse/coverage.js";
export { WG_UI_SEL, WG_READY_PANEL_SEL, WG_READY_AUTO_SEL, WG_READY_BANNER_SEL, readWgOverlayBeacon, readWgOverlayBeaconInPage, assertWgOverlayReady } from "./demo/overlay/beacon.js";
export type { WgModalKind, WgBeaconRow } from "./demo/overlay/beacon.js";
export { AutoSession } from "./live/auto-session/auto-session.js";
export type { ListPick, SessionRead } from "./live/auto-session/read.js";
export { SESSION_OPS, SESSION_PROTOCOL_VERSION } from "./live/auto-session/protocol.js";
export type {
  SessionRequest,
  SessionResponse,
  SessionStreamMessage,
  HelloResponse,
  StatusOrSendResponse,
  DomResponse,
  TraceResponse,
  ConsoleResponse,
  StorageResponse,
  ReachResponse,
  ReadResponse,
  HighlightResponse,
} from "./live/auto-session/protocol.js";
export { subscribeSession } from "./live/auto-session/feed.js";
export { requestSession } from "./live/auto-session/ipc.js";
export { stubFilePath } from "./live/auto-session/helpers.js";
export type { AutoSessionInit, SessionSnapshot, SessionSnapshotEdge, SessionSnapshotSection, ApplyPickResult, ApplyPathResult, TraceStep, ConsoleLogEntry, StorageSnapshot, ServiceWorkerRegistrationInfo, CookieInfo, StubFileKind } from "./live/auto-session/helpers.js";
export { pilotStart } from "./live/pilot/pilot.js";
export type { PilotStartResult } from "./live/pilot/pilot.js";
export { defineConfig, resolveBaseUrl } from "./runtime/waygraph-config.js";
export type { WaygraphConfig, ConfigContext, VideoSettings, RunSettings, DemoSettings, OverlaySettings, VoiceSettings } from "./runtime/waygraph-config.js";
export { commandVoice, kokoroVoice, openAIVoice } from "./runtime/voice.js";
export type { Voice, KokoroVoiceOptions, OpenAIVoiceOptions } from "./runtime/voice.js";
export { withWebServer } from "./runtime/webserver.js";
export { chromiumExecutablePath } from "./runtime/browser.js";
export { resolveExtension, KNOWN_EXTENSIONS } from "./runtime/extensions.js";
export type { ExtensionSpec } from "./engine/config.js";
export type { WebServerConfig } from "./runtime/webserver.js";

// Types the API above refers to (each is part of a public signature).
export type { BlockBase, RoutedBlockBase } from "./engine/checkpoint/route.js";
export type { RunEventListener } from "./engine/run/events.js";
export type { ScanOptions } from "./manifest/project.js";
export type { BlockKind } from "./engine/block/kind.js";
export type { DomSnapshot, InspectDomOptions, InspectDomResult } from "./live/auto-session/helpers.js";
export type { BrowserStartInit } from "./live/auto-session/start.js";
export type { PilotFixtureRing, PilotHighlightFixtures } from "./demo/overlay/pilot/fixtures.js";

// Read Blocks: what a page shows, as data (defineReadBlock, reads, ReadPage).
export { reads, ReadKey } from "./engine/read/read-key.js";
export type { ReadNamespace, ReadSpec, ReadFieldsOf } from "./engine/read/read-key.js";
export type { FieldKind, FieldPlan, PageReaders, Reader, ReaderPlan, ReadCtx, ReadFields, RowCtx } from "./engine/read/readers.js";
export { ReadPage } from "./engine/read/read-page.js";
export { defineReadBlock, readCheckpoint } from "./engine/read/read-block.js";
export type { ReadBlock, ReadBlockOptions, CheckpointRead, ReadShape } from "./engine/read/read-block.js";
