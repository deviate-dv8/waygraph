// Moved verbatim from the former CHAIN_RUNNER_SCRIPT template string in cli.ts (see src/ARCHITECTURE.md).
// Runs inside the target project's own waygraph copy - keep it dependency-light and self-contained.
import { resetPageState } from "./teardown.js";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * "chain WAYGRAPH_JSON=1" - the unattended counterpart to "chain --step": no
 * human gate, no overlay, headless by default. The same execution --step
 * already has (session-reset boundaries, per-segment mem-seeding) but
 * reporting built for an agent reading stdout afterward, not a human
 * watching the browser live - a flat JSON object naming exactly which Block
 * failed, what every EARLIER Block resolved to, and a screenshot at the
 * exact moment of failure, since there's no live browser for a human to
 * glance at instead. (Previously its own "waygraph auto" verb - renamed once
 * "auto" came to mean the state-machine discovery tool instead; this is a
 * chain reporting mode, not a distinct command.)
 */
export async function runJsonReportMode(engine, start, end, context, page, mem, resolved, baseURL) {
  const steps = [];
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i];
    if (r.seedMem) r.seedMem();
    if (r.resetSession && i > 0) {
      await resetPageState(context, page, baseURL);
    }
    const startedAt = Date.now();
    const stepFlow = engine.defineFlow([start, r.block, end]);
    try {
      const outcome = await stepFlow.run(context, mem, { page, closeOnFinish: false });
      steps.push({ name: r.block.name, checkpoint: outcome.result, ms: Date.now() - startedAt });
    } catch (err) {
      if (r.expectedFailureReason) {
        steps.push({
          name: r.block.name,
          expectedFailure: true,
          error: err && err.message ? err.message : String(err),
          ms: Date.now() - startedAt,
        });
        return {
          ok: true,
          expectedFailure: true,
          failedAt: r.block.name,
          reason: r.expectedFailureReason,
          steps,
        };
      }
      let screenshot = null;
      try {
        screenshot = join(tmpdir(), "waygraph-chain-failure-" + Date.now() + ".png");
        await page.screenshot({ path: screenshot, fullPage: true });
      } catch {
        screenshot = null;
      }
      return {
        ok: false,
        failedAt: r.block.name,
        stepIndex: i,
        totalSteps: resolved.length,
        error: err && err.message ? err.message : String(err),
        steps,
        screenshot,
      };
    }
  }
  return { ok: true, result: steps.length > 0 ? steps[steps.length - 1].checkpoint : null, steps };
}


export function isExpectedChainFailure(chainFlows, err) {
  if (!chainFlows || chainFlows.length === 0) return false;
  const last = chainFlows[chainFlows.length - 1];
  if (!last?.expectedFailureReason) return false;
  const msg = err && err.message ? err.message : String(err);
  return msg.includes("viewer-login") || msg.includes("reached-inventory-or-genuinely-blocked");
}


export async function runChainedFlows(chainFlow, chainFlows, context, mem, page) {
  try {
    const outcome = await chainFlow(...chainFlows).run(context, mem, { page, closeOnFinish: false });
    return outcome?.result !== undefined ? outcome.result : outcome;
  } catch (err) {
    if (isExpectedChainFailure(chainFlows, err)) {
      return { __expectedFailure: true, message: err && err.message ? err.message : String(err) };
    }
    throw err;
  }
}


/** Parses WAYGRAPH_VIDEO_VIEWPORT / --video-viewport: "1920x1080" or "1920,1080". */
export function parseVideoViewport(raw) {
  if (!raw || !raw.trim()) return null;
  const m = raw.trim().match(/^(\d{3,5})[xX,](\d{3,5})$/);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < 320 || height < 240 || width > 7680 || height > 4320) return null;
  return { width, height };
}
