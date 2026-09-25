// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { parseBlocksSelect } from "../blocks-select.js";
import { parseMinEdgeCoverage } from "../traverse-coverage.js";
import { runTraverse } from "../traverse-run.js";

export async function traverseCase(args: string[]): Promise<void> {
      if (args.includes("--step") || args.includes("--auto-next") || args.includes("--autoplay")) {
        console.error("waygraph traverse: --step / --auto-next not supported (not a demo)");
        process.exit(1);
      }
      const rest = args.slice(1);
      let from: string | undefined;
      let data: string | undefined;
      let maxSteps: number | undefined;
      let maxVisits: number | undefined;
      let maxEdge: number | undefined;
      let headed = false;
      let baseUrl: string | undefined;
      let blocksFilter: string | undefined;
      let parallel: number | undefined;
      let session: "clone" | "inherit" | undefined;
      let minEdgeCoverageRaw: string | undefined;
      let coverageOut: string | undefined;
      let noCoverageReport = false;
      let projectDir = process.cwd();
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i]!;
        if (a === "--from" || a.startsWith("--from=")) {
          from = a.startsWith("--from=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--data" || a.startsWith("--data=")) {
          data = a.startsWith("--data=") ? a.slice(7) : rest[++i];
          continue;
        }
        if (a === "--blocks" || a.startsWith("--blocks=")) {
          if (a.startsWith("--blocks=")) {
            blocksFilter = a.slice("--blocks=".length);
          } else {
            const v = rest[++i];
            if (!v || v.startsWith("-")) {
              console.error(
                "waygraph traverse: --blocks needs a glob, /regex/, or path substring",
              );
              process.exit(1);
            }
            blocksFilter = v;
          }
          continue;
        }
        if (a === "--parallel" || a.startsWith("--parallel=")) {
          const v = a.startsWith("--parallel=") ? a.slice("--parallel=".length) : rest[++i];
          parallel = Number(v);
          continue;
        }
        if (a === "--session" || a.startsWith("--session=")) {
          const v = a.startsWith("--session=") ? a.slice("--session=".length) : rest[++i];
          if (v !== "clone" && v !== "inherit") {
            console.error('waygraph traverse: --session must be "clone" or "inherit"');
            process.exit(1);
          }
          session = v;
          continue;
        }
        if (a === "--min-edge-coverage" || a.startsWith("--min-edge-coverage=")) {
          minEdgeCoverageRaw = a.startsWith("--min-edge-coverage=")
            ? a.slice("--min-edge-coverage=".length)
            : rest[++i];
          continue;
        }
        if (a === "--coverage-out" || a.startsWith("--coverage-out=")) {
          coverageOut = a.startsWith("--coverage-out=")
            ? a.slice("--coverage-out=".length)
            : rest[++i];
          continue;
        }
        if (a === "--no-coverage-report") {
          noCoverageReport = true;
          continue;
        }
        if (a === "--max-steps" || a.startsWith("--max-steps=")) {
          const v = a.startsWith("--max-steps=") ? a.slice(12) : rest[++i];
          maxSteps = Number(v);
          continue;
        }
        if (a === "--max-visits" || a.startsWith("--max-visits=")) {
          const v = a.startsWith("--max-visits=") ? a.slice(13) : rest[++i];
          maxVisits = Number(v);
          continue;
        }
        if (a === "--max-visits-per-edge" || a.startsWith("--max-visits-per-edge=")) {
          const v = a.startsWith("--max-visits-per-edge=")
            ? a.slice("--max-visits-per-edge=".length)
            : rest[++i];
          maxEdge = Number(v);
          continue;
        }
        if (a === "--non-headless" || a === "--headed") {
          headed = true;
          continue;
        }
        if (a === "--base-url" || a.startsWith("--base-url=")) {
          baseUrl = a.startsWith("--base-url=") ? a.slice(11) : rest[++i];
          continue;
        }
        if (a === "--help" || a === "-h") {
          console.log(`waygraph traverse [project] [flags]

Graph crawl (RFC Phase B-E). Walks unused legal edges until a leaf,
budget kill, or first broken edge. --parallel N uses session clone + edge leases.

  --blocks <glob|/regex/|substr>  Phase C: filter *.block.ts discovery
  --parallel N            Phase D: N clone workers (default 1, max 4)
  --session clone|inherit Phase D: default clone; inherit refused if parallel>1
  --min-edge-coverage X   Phase E: suite gate 0.8 | 80% | 80 (exit 2 if below)
  --coverage-out PATH     Phase E: write JSON (default .waygraph-traverse/coverage.json)
  --no-coverage-report    Phase E: print Coverage line only (no JSON file)
  --from <Checkpoint>     start checkpoint (optional)
  --data '{...}'          Mem seed JSON
  --max-steps N           default 50 (per worker)
  --max-visits N          per-node visit cap (default 2)
  --max-visits-per-edge N default 1
  --non-headless          show browser
  --base-url URL

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
        if (!a.startsWith("-")) {
          projectDir = resolve(a);
        }
      }
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
        ...(maxSteps !== undefined && Number.isFinite(maxSteps) ? { maxSteps } : {}),
        ...(maxVisits !== undefined && Number.isFinite(maxVisits)
          ? { maxVisitsPerNode: maxVisits }
          : {}),
        ...(maxEdge !== undefined && Number.isFinite(maxEdge)
          ? { maxVisitsPerEdge: maxEdge }
          : {}),
        headed,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        ...(blocksSelect ? { blocksSelect } : {}),
        ...(parallel !== undefined && Number.isFinite(parallel) ? { parallel } : {}),
        ...(session ? { session } : {}),
        ...(minEdgeCoverage !== undefined ? { minEdgeCoverage } : {}),
        ...(coverageOut ? { coverageOut: resolve(coverageOut) } : {}),
        ...(noCoverageReport ? { noCoverageReport: true } : {}),
      });
      process.exit(code);
}
