// The manifest: everything a project defines, as plain JSON. `waygraph manifest` prints it; Waygraph UI and map packages
// read it instead of importing the project.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scanProject } from "./project.js";
import type { BlockKind, ProjectScan, ScanOptions } from "./project.js";

export const MANIFEST_VERSION = 1;

export interface ManifestBlock {
  /** `file#exportName`, unique across the project. */
  id: string;
  name: string;
  exportName: string;
  kind: BlockKind;
  description: string;
  from: string[];
  to: string[];
  requires: string[];
  file: string;
  /** The `src/map/` group folder the Block lives in, e.g. `(external)/hoppscotch`, when it uses the Map layout. */
  map?: string;
  /** Still written in the deprecated `<In, Out>` form. */
  legacy?: true;
}

export interface ManifestFlow {
  /** `file#exportName`. */
  id: string;
  exportName: string;
  file: string;
  /** The folders under `src/flows/` (the page or `(user-story)` it belongs to) and the file's name (the outcome). */
  useCase: { path: string[]; outcome: string };
  /** Block names in run order, nested flows flattened. */
  steps: string[];
  settings: { memStub?: true; expectedFailure?: string; sessionReset?: true; demoPace?: unknown };
}

export interface Manifest {
  version: number;
  project: { name: string; dir: string; waygraph: string };
  checkpoints: string[];
  maps: string[];
  blocks: ManifestBlock[];
  flows: ManifestFlow[];
  skipped: ProjectScan["skipped"];
}

function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "..", "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

function projectName(dir: string): string {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name ?? dir;
  } catch {
    return dir;
  }
}

/** `(external)/hoppscotch` for `src/map/(external)/hoppscotch/_methods/x.block.ts`: the group plus its first folder. */
function mapGroupOf(file: string): string | undefined {
  const parts = file.split(/[\\/]/);
  const i = parts.indexOf("map");
  if (i < 0 || parts[i - 1] !== "src") return undefined;
  const rest = parts.slice(i + 1, -1);
  if (rest.length === 0) return undefined;
  return /^\(.*\)$/.test(rest[0]!) && rest[1] && !rest[1].startsWith("_") ? `${rest[0]}/${rest[1]}` : rest[0];
}

function useCaseOf(file: string): ManifestFlow["useCase"] {
  const parts = file.split(/[\\/]/);
  const i = parts.indexOf("flows");
  const folders = i >= 0 ? parts.slice(i + 1, -1) : [];
  return { path: folders, outcome: parts[parts.length - 1]!.replace(/\.flow\.ts$/, "") };
}

/** Builds the manifest from a scan. */
export function manifestFromScan(scan: ProjectScan): Manifest {
  const checkpoints = new Set<string>();
  const maps = new Set<string>();
  const blocks: ManifestBlock[] = scan.blocks.map((b) => {
    for (const t of [...b.from, ...b.to]) if (t !== "*") checkpoints.add(t);
    const map = mapGroupOf(b.file);
    if (map) maps.add(map);
    return {
      id: `${b.file}#${b.exportName}`,
      name: b.name,
      exportName: b.exportName,
      kind: b.kind,
      description: b.description,
      from: b.from,
      to: b.to,
      requires: b.requires,
      file: b.file,
      ...(map ? { map } : {}),
      ...(b.legacy ? { legacy: true as const } : {}),
    };
  });
  const flows: ManifestFlow[] = scan.flows.map((f) => {
    const flow = f.flow as {
      blocks: () => { name: string }[];
      memStub?: boolean;
      expectedFailureReason?: string;
      resetSession?: boolean;
      demoPace?: unknown;
    };
    return {
      id: `${f.file}#${f.exportName}`,
      exportName: f.exportName,
      file: f.file,
      useCase: useCaseOf(f.file),
      steps: flow.blocks().map((s) => s.name),
      settings: {
        ...(flow.memStub ? { memStub: true as const } : {}),
        ...(flow.expectedFailureReason ? { expectedFailure: flow.expectedFailureReason } : {}),
        ...(flow.resetSession ? { sessionReset: true as const } : {}),
        ...(flow.demoPace !== undefined ? { demoPace: flow.demoPace } : {}),
      },
    };
  });
  return {
    version: MANIFEST_VERSION,
    project: { name: projectName(scan.projectDir), dir: scan.projectDir, waygraph: packageVersion() },
    checkpoints: [...checkpoints].sort(),
    maps: [...maps].sort(),
    blocks,
    flows,
    skipped: scan.skipped,
  };
}

/** Scans the project and returns its manifest. */
export async function buildManifest(projectDir: string, opts: ScanOptions = {}): Promise<Manifest> {
  return manifestFromScan(await scanProject(projectDir, opts));
}

