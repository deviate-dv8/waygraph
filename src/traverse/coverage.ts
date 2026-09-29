/**
 * Phase E: traverse edge coverage report + suite gate.
 * Coverage is independent of leaf PASS - a green leaf can still fail CI
 * when --min-edge-coverage is set and ratio is too low.
 *
 * Denominator = unique static graph edge block names (FF inners stay as their
 * own graph edges when discovered; RFC open Q deferred - no covered-via-prefix yet).
 * A hit of `block::instanceId` counts as covering `block`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface TraverseCoverageReport {
  version: 1;
  generatedAt: string;
  projectDir: string;
  parallel: number;
  /** Unique edge keys in the discovered graph (block names). */
  edgesTotal: number;
  /** Graph edges successfully walked this suite (after instance normalize). */
  edgesHit: number;
  /** edgesHit / edgesTotal (0 when total is 0). */
  ratio: number;
  /** Optional suite gate that was applied (0-1). */
  minEdgeCoverage?: number;
  /** true when minEdgeCoverage was set and ratio met it. */
  coveragePass?: boolean;
  /** Sorted graph edge keys that were hit. */
  hit: string[];
  /** Sorted graph edge keys never walked. */
  missed: string[];
  /** Raw worker hit keys (may include block::instanceId). */
  rawHit?: string[];
  workers?: Array<{
    traverseId: string;
    exitCode: number;
    steps: number;
    edgesHit: number;
    leaf?: string;
  }>;
}

/** Static graph edge key = Block runtime name. */
export function edgeKeyFromGraphEdge(edge: { block: string }): string {
  return edge.block;
}

/** Collect unique edge keys from a WaygraphGraph-like edges list. */
export function collectGraphEdgeKeys(
  edges: ReadonlyArray<{ block: string }>,
): string[] {
  const set = new Set<string>();
  for (const e of edges) set.add(edgeKeyFromGraphEdge(e));
  return [...set].sort();
}

/**
 * Map a worker hit key onto the static graph key it covers.
 * `add-to-cart::sku-1` -> `add-to-cart` when that block is in the graph.
 */
export function normalizeHitKey(
  hitKey: string,
  graphKeys: ReadonlySet<string>,
): string | null {
  if (graphKeys.has(hitKey)) return hitKey;
  const base = hitKey.includes("::") ? hitKey.slice(0, hitKey.indexOf("::")) : hitKey;
  if (graphKeys.has(base)) return base;
  return null;
}

/**
 * Parse --min-edge-coverage: `0.8`, `80%`, `80` (as percent when > 1).
 * Returns 0-1 fraction, or null when unset/invalid.
 */
export function parseMinEdgeCoverage(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 0) return null;
    if (raw <= 1) return raw;
    if (raw <= 100) return raw / 100;
    return null;
  }
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t.endsWith("%")) {
    const n = Number(t.slice(0, -1));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n / 100;
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n <= 1) return n;
  if (n <= 100) return n / 100;
  return null;
}

export function buildCoverageReport(opts: {
  projectDir: string;
  parallel: number;
  allEdgeKeys: readonly string[];
  hitKeys: ReadonlySet<string> | readonly string[];
  minEdgeCoverage?: number | null;
  workers?: TraverseCoverageReport["workers"];
}): TraverseCoverageReport {
  const all = [...new Set(opts.allEdgeKeys)].sort();
  const graphSet = new Set(all);
  const rawList = Array.isArray(opts.hitKeys) ? [...opts.hitKeys] : [...opts.hitKeys];
  const covered = new Set<string>();
  for (const raw of rawList) {
    const n = normalizeHitKey(raw, graphSet);
    if (n) covered.add(n);
  }
  const hit = all.filter((k) => covered.has(k));
  const missed = all.filter((k) => !covered.has(k));
  const edgesTotal = all.length;
  const edgesHit = hit.length;
  const ratio = edgesTotal === 0 ? 0 : edgesHit / edgesTotal;
  const min =
    opts.minEdgeCoverage != null && Number.isFinite(opts.minEdgeCoverage)
      ? Math.min(1, Math.max(0, opts.minEdgeCoverage))
      : undefined;
  const coveragePass = min === undefined ? undefined : ratio + 1e-12 >= min;
  const coverageExtra =
    min !== undefined && coveragePass !== undefined
      ? { minEdgeCoverage: min, coveragePass }
      : {};
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectDir: opts.projectDir,
    parallel: opts.parallel,
    edgesTotal,
    edgesHit,
    ratio: Math.round(ratio * 10000) / 10000,
    ...coverageExtra,
    hit,
    missed,
    rawHit: [...new Set(rawList)].sort(),
    ...(opts.workers ? { workers: opts.workers } : {}),
  };
}

/** Greppable one-liner for agents/CI. */
export function formatCoverageLine(report: TraverseCoverageReport): string {
  const pct = (report.ratio * 100).toFixed(1);
  const minPart =
    report.minEdgeCoverage !== undefined
      ? ` min=${(report.minEdgeCoverage * 100).toFixed(1)}%` +
        (report.coveragePass === false
          ? " FAIL"
          : report.coveragePass === true
            ? " PASS"
            : "")
      : "";
  return `[Coverage edges=${report.edgesHit}/${report.edgesTotal} ratio=${pct}%${minPart}]`;
}

export function defaultCoverageOutPath(projectDir: string): string {
  return join(projectDir, ".waygraph-traverse", "coverage.json");
}

export function writeCoverageReport(path: string, report: TraverseCoverageReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n", "utf-8");
}
