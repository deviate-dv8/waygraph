import type { DemoPace } from "../../engine/stub/pace.js";
import type { FixtureDurationFields } from "../../engine/stub/ring.js";
import { envString } from "../../engine/env.js";

/** Default fixture dwell when `duration: true`. */
export const FIXTURE_DURATION_MS_DEFAULT = 2000;

/** Default fixture dwell under `--fast` when duration is enabled. */
export const FIXTURE_DURATION_FAST_MS_DEFAULT = 600;

/** Default fixture dwell under demo pace `slow` (gaps / wrongs review). */
export const FIXTURE_DURATION_SLOW_MS_DEFAULT = 4000;




/** Turns any accepted pace spelling into a `DemoPace`; unknown values mean normal. */
export function normalizeDemoPace(raw: unknown): DemoPace {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    if (t === "blitz" || t === "ff") return "blitz";
    if (t === "fast" || t === "quick") return "fast";
    if (t === "slow" || t === "careful" || t === "review") return "slow";
    if (t === "normal" || t === "default" || t === "1x") return "normal";
    // "2x" / "0.5x"
    if (t.endsWith("x")) {
      const n = Number(t.slice(0, -1));
      if (Number.isFinite(n) && n > 0) return n;
    }
    const n = Number(t);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return "normal";
}


/** Named / numeric pace -> scale vs normal (1 = normal). Absolute ms (>20) maps via default dwell. */
/**
 * What each named pace means, as a multiplier of normal dwell (1 = normal). `demo.speeds` in the config (or
 * `WAYGRAPH_PACE_SPEEDS`, a JSON object) overrides any of them; the defaults are blitz 0.05, fast 0.33, slow 2.
 */
function paceSpeeds(): { blitz: number; fast: number; slow: number } {
  const out = { blitz: 0.05, fast: 0.33, slow: 2 };
  try {
    const speeds = envString("WAYGRAPH_PACE_SPEEDS");
    const raw = speeds ? JSON.parse(speeds) : {};
    for (const k of ["blitz", "fast", "slow"] as const) {
      if (typeof raw[k] === "number" && raw[k] > 0) out[k] = Math.min(10, raw[k]);
    }
  } catch {
    /* ignore a malformed value: defaults apply */
  }
  return out;
}


/** The multiplier a pace applies to dwell and gate time (1 = normal); `demo.speeds` redefines the named ones. */
export function demoPaceScale(pace: DemoPace): number {
  if (typeof pace === "number") {
    if (pace > 20) return Math.min(10, Math.max(0.05, pace / FIXTURE_DURATION_MS_DEFAULT));
    return Math.min(10, Math.max(0.05, pace));
  }
  if (pace === "blitz") return paceSpeeds().blitz;
  if (pace === "fast") return paceSpeeds().fast;
  if (pace === "slow") return paceSpeeds().slow;
  return 1;
}


/** True when a pace is blitz: no cursor, ring pop or typing animation. */
export function demoPaceIsBlitz(pace: DemoPace): boolean {
  return pace === "blitz" || (typeof pace === "number" && pace > 0 && pace <= 0.1);
}


/** True when pace should use the short-gate / fast fixture path (not slow authored). */
export function demoPaceIsFast(pace: DemoPace): boolean {
  if (demoPaceIsBlitz(pace)) return true;
  if (pace === "fast") return true;
  if (typeof pace === "number" && pace <= 20) return pace < 0.75;
  return false;
}


/** True when a pace lengthens dwell and gates. */
export function demoPaceIsSlow(pace: DemoPace): boolean {
  if (pace === "slow") return true;
  if (typeof pace === "number") {
    if (pace > 20) return pace >= 3000;
    return pace > 1.25;
  }
  return false;
}


/** Autoplay / Next-gate ms for this pace (base is WAYGRAPH_AUTOPLAY_MS or 1800). */
export function demoPaceGateMs(pace: DemoPace, baseAutoplayMs: number): number {
  if (pace === "blitz" && envString("WAYGRAPH_PACE_SPEEDS")) {
    return Math.min(30000, Math.max(20, Math.round(baseAutoplayMs * paceSpeeds().blitz)));
  }
  if (demoPaceIsBlitz(pace)) return Math.min(80, baseAutoplayMs);
  if (typeof pace === "number" && pace > 20) {
    return Math.min(30000, Math.max(80, Math.round(pace)));
  }
  const scale = demoPaceScale(pace);
  return Math.min(30000, Math.max(80, Math.round(baseAutoplayMs * scale)));
}


/**
 * Short chip for the demo panel (e.g. `2.5x`, `4500ms`, `slow`).
 * Always printable - numbers speak in the UI, not only in code.
 */
export function formatDemoPaceBadge(pace: DemoPace, baseAutoplayMs = 1800): string {
  const p = normalizeDemoPace(pace);
  if (typeof p === "number" && p > 20) return `${Math.round(p)}ms`;
  if (typeof p === "number") {
    const s = Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100);
    return `${s}x`;
  }
  if (p === "blitz") return "blitz";
  if (p === "fast") return "fast";
  if (p === "slow") return "slow";
  void baseAutoplayMs;
  return "1x";
}


/**
 * Loud one-line pace description for panel + console
 * (e.g. `pace 2.5x (~4500ms gates)` / `pace 4500ms gates (~2.25x)`).
 */
export function formatDemoPaceLabel(pace: DemoPace, baseAutoplayMs = 1800): string {
  const p = normalizeDemoPace(pace);
  const gate = demoPaceGateMs(p, baseAutoplayMs);
  const scale = demoPaceScale(p);
  const scaleTxt = Number.isInteger(scale) ? String(scale) : (Math.round(scale * 100) / 100).toString();
  if (typeof p === "number" && p > 20) {
    return `pace ${Math.round(p)}ms gates (~${scaleTxt}x)`;
  }
  if (typeof p === "number") {
    const s = Number.isInteger(p) ? String(p) : String(Math.round(p * 100) / 100);
    return `pace ${s}x (~${gate}ms gates)`;
  }
  if (p === "blitz") return `pace blitz (~${gate}ms, skip theater)`;
  if (p === "fast") return `pace fast (~${scaleTxt}x, ~${gate}ms gates)`;
  if (p === "slow") return `pace slow (~${scaleTxt}x, ~${gate}ms gates)`;
  return `pace normal (1x, ~${gate}ms gates)`;
}


/**
 * Resolve min dwell ms for any fixture (a stub ring or a yap slide),
 * or `null` when duration is unset (caller keeps its default timing).
 *
 * Authoring wins: an explicit slow/numeric pace is not crushed by CLI `--fast`
 * (`gatesFast`). `--fast` only shortens when pace is unset/normal.
 */
export function resolveFixtureDwellMs(
  fixture: FixtureDurationFields,
  opts?: { gatesFast?: boolean; pace?: DemoPace | undefined },
): number | null {
  if (fixture.duration === undefined || fixture.duration === false) return null;
  const pace =
    opts?.pace !== undefined && opts.pace !== null
      ? normalizeDemoPace(opts.pace)
      : opts?.gatesFast
        ? "fast"
        : "normal";
  const fastMs =
    typeof fixture.fastMode === "number" && Number.isFinite(fixture.fastMode) && fixture.fastMode >= 0
      ? fixture.fastMode
      : FIXTURE_DURATION_FAST_MS_DEFAULT;
  const normalMs =
    fixture.duration === true
      ? FIXTURE_DURATION_MS_DEFAULT
      : typeof fixture.duration === "number" && Number.isFinite(fixture.duration) && fixture.duration >= 0
        ? fixture.duration
        : FIXTURE_DURATION_MS_DEFAULT;

  if (typeof pace === "number") {
    if (pace > 20) return Math.round(pace);
    return Math.max(0, Math.round(normalMs * Math.min(10, Math.max(0.05, pace))));
  }
  if (pace === "blitz" || pace === "fast") return fastMs;
  // CLI --fast only when author left pace at normal
  if (opts?.gatesFast && pace === "normal") return fastMs;
  if (pace === "slow") return Math.max(normalMs, FIXTURE_DURATION_SLOW_MS_DEFAULT);
  return normalMs;
}


/**
 * Effective demo pace for a step: block override > flow episode > normal.
 * Opaque FF / wasFastForward always win as blitz.
 */
export function resolveStepDemoPace(opts: {
  blockPace?: DemoPace | string | number | null;
  flowPace?: DemoPace | string | number | null;
  fastForward?: boolean;
  wasFastForward?: boolean;
}): DemoPace {
  if (opts.fastForward || opts.wasFastForward) return "blitz";
  if (opts.blockPace != null && opts.blockPace !== "") {
    return normalizeDemoPace(opts.blockPace);
  }
  if (opts.flowPace != null && opts.flowPace !== "") {
    return normalizeDemoPace(opts.flowPace);
  }
  return "normal";
}
