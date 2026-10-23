import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { parseBlocksSelect } from "../../manifest/select.js";
import { parseMinEdgeCoverage } from "../../live/traverse/coverage.js";
import { runTraverse } from "../../live/traverse/traverse.js";
import { helpLines, parseCommand } from "../args.js";
import type { OptionTable } from "../args.js";

const OPTIONS = {
  "blocks": { type: "string", value: "<glob|/regex/|substr>", help: "Phase C: filter *.block.ts discovery" },
  "parallel": { type: "string", value: "N", help: "Phase D: N clone workers (default 1, max 4)" },
  "session": { type: "string", value: "clone|inherit", help: "Phase D: default clone; inherit refused if parallel>1" },
  "min-edge-coverage": { type: "string", value: "X", help: "Phase E: suite gate 0.8 | 80% | 80 (exit 2 if below)" },
  "coverage-out": { type: "string", value: "PATH", help: "Phase E: write JSON (default .waygraph-traverse/coverage.json)" },
  "no-coverage-report": { type: "boolean", help: "Phase E: print the Coverage line only (no JSON file)" },
  "from": { type: "string", value: "<Checkpoint>", help: "Start checkpoint (optional)" },
  "data": { type: "string", value: "'{...}'", help: "Mem seed JSON" },
  "max-steps": { type: "string", value: "N", help: "Default 50 (per worker)" },
  "max-visits": { type: "string", value: "N", help: "Per-node visit cap (default 2)" },
  "max-visits-per-edge": { type: "string", value: "N", help: "Default 1" },
  "non-headless": { type: "boolean", help: "Show the browser" },
  "base-url": { type: "string", value: "<url>", help: "Base URL" },
  "help": { type: "boolean", help: "This help" },
} as const satisfies OptionTable;

/** A number flag, or exit naming it. */
function numberFlag(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    console.error(`waygraph traverse: --${name} needs a number (got ${JSON.stringify(raw)})`);
    process.exit(1);
  }
  return n;
}

export async function traverseCase(args: string[]): Promise<void> {
      const { values: v, positionals } = parseCommand("traverse", OPTIONS, args.slice(1));
      if (v.help) {
        console.log(`waygraph traverse [project] [flags]

Graph crawl (RFC Phase B-E). Walks unused legal edges until a leaf,
budget kill, or first broken edge. --parallel N uses session clone + edge leases.

${helpLines(OPTIONS)}

Examples:
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'
  waygraph traverse --parallel 2 --session clone --max-steps 20
  waygraph traverse --min-edge-coverage 80% --coverage-out ./cov.json

PASS:  [Reached Leaf Node[traverse-1] at=... steps=N]
FAIL:  [Broke at edge[traverse-1] block=... from=... to=...]
COVER: [Coverage edges=H/T ratio=R% min=M% PASS|FAIL]
`);
        process.exit(0);
      }
      if (v.session !== undefined && v.session !== "clone" && v.session !== "inherit") {
        console.error('waygraph traverse: --session must be "clone" or "inherit"');
        process.exit(1);
      }
      const session = v.session as "clone" | "inherit" | undefined;
      const projectDir = resolve(positionals[0] ?? process.cwd());
      const from = v.from;
      const data = v.data;
      const maxSteps = numberFlag("max-steps", v["max-steps"]);
      const maxVisits = numberFlag("max-visits", v["max-visits"]);
      const maxEdge = numberFlag("max-visits-per-edge", v["max-visits-per-edge"]);
      const parallel = numberFlag("parallel", v.parallel);
      const headed = v["non-headless"] === true;
      const baseUrl = v["base-url"];
      const blocksFilter = v.blocks;
      const minEdgeCoverageRaw = v["min-edge-coverage"];
      const coverageOut = v["coverage-out"];
      const noCoverageReport = v["no-coverage-report"] === true;
      if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
        console.error(`waygraph traverse: no such directory: ${projectDir}`);
        process.exit(1);
      }
      const blocksSelect = blocksFilter
        ? parseBlocksSelect(blocksFilter)
        : undefined;
      let minEdgeCoverage: number | undefined;
      if (minEdgeCoverageRaw !== undefined) {
        const parsed = parseMinEdgeCoverage(minEdgeCoverageRaw);
        if (parsed === null) {
          console.error(
            `waygraph traverse: --min-edge-coverage expects 0.8, 80%, or 80 (got ${JSON.stringify(minEdgeCoverageRaw)})`,
          );
          process.exit(1);
        }
        minEdgeCoverage = parsed;
      }
      const code = await runTraverse(projectDir, {
        ...(from ? { from } : {}),
        ...(data ? { data } : {}),
        ...(maxSteps !== undefined ? { maxSteps } : {}),
        ...(maxVisits !== undefined ? { maxVisitsPerNode: maxVisits } : {}),
        ...(maxEdge !== undefined ? { maxVisitsPerEdge: maxEdge } : {}),
        headed,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(blocksSelect ? { blocksSelect } : {}),
        ...(parallel !== undefined ? { parallel } : {}),
        ...(session ? { session } : {}),
        ...(minEdgeCoverage !== undefined ? { minEdgeCoverage } : {}),
        ...(coverageOut ? { coverageOut: resolve(coverageOut) } : {}),
        ...(noCoverageReport ? { noCoverageReport: true } : {}),
      });
      process.exit(code);
}
