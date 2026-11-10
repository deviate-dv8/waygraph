// The manifest: everything a project defines, as plain JSON. `waygraph manifest` prints it; Waygraph UI and map packages
// read it instead of importing the project.
import { messageOf } from "../engine/errors.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { scanProject } from "./project.js";
import type { BlockKind } from "../engine/block/kind.js";
import type { ProjectScan, ScanOptions } from "./project.js";
import { MemPage } from "../engine/mem/mem.js";
import { readBlockShape, type ReadShape } from "../engine/read/read-block.js";
import { pageUrls, urlOf } from "./urls.js";
import { describeExpectations } from "../engine/run/expect.js";
import type { SomeBlock } from "../engine/block/some-block.js";
import type { Trait } from "../engine/trait/trait.js";
import { walkDir } from "./scan.js";
import { forgetSources, selectorEntries, selectorFilesUnder, selectorsUsed, spanOf, type SelectorEntry, type SourceSpan } from "./selectors.js";
import { labelsOf, type Labels } from "./labels.js";

export const MANIFEST_VERSION = 2;

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
  /** What the Block promises wherever it's used (its `expect`), in words; per outcome as "if Tag: ...". */
  expect: string[];
  file: string;
  /** The `src/map/` group folder the Block lives in (e.g. `(external)/hoppscotch`), or the map package it came from. */
  map?: string;
  /** Where a Nav or Page Block goes by url: the url, or the pattern a url built from mem makes (`/requests/:id`). */
  url?: string;
  /** The lines of `file` that define it. */
  source?: SourceSpan;
  /** What it checks before acting and on arrival: each Trait as data, or `"dynamic"` when a function builds them. */
  checks: { precondition: ManifestCheck[] | "dynamic"; verify: ManifestCheck[] | "dynamic" };
  /** The selector entries its definition reads (`LoginSel.submit`), from the project's selector files. */
  selectors: SelectorEntry[];
}

/** A Trait as data: its name, what it wants, and the element it looks at. */
export interface ManifestCheck {
  name: string;
  wants?: string;
  selector?: string;
}

export interface ManifestFlow {
  /** `file#exportName`. */
  id: string;
  exportName: string;
  file: string;
  source?: SourceSpan;
  /** Its labels, from the config's `labels` (`waygraph test --flows --label auth`). */
  labels: string[];
  /** The folders under `src/flows/` (the page or `(user-story)` it belongs to) and the file's name (the outcome). */
  useCase: { path: string[]; outcome: string };
  /** Block names in run order, nested flows flattened. */
  steps: string[];
  /** What each step expects (the Block's and the step's own), in words: one list per entry of `steps`. */
  stepExpects: string[][];
  settings: { memStub?: true; expectedFailure?: string; sessionReset?: true; demoPace?: unknown };
}

/** A Read Block: which Checkpoints it reads and the shape of what it returns. */
export interface ManifestReadBlock {
  id: string;
  name: string;
  exportName: string;
  description: string;
  /** Checkpoint tags it reads on (`"*"` = every page). */
  from: string[];
  requires: string[];
  /** Field path -> shape (`"catalog.items": [{ name: "string", price: "number" }]`); absent when `read` needs Mem to build. */
  fields?: Record<string, ReadShape>;
  /** Why `fields` is absent. */
  fieldsError?: string;
  file: string;
  map?: string;
  source?: SourceSpan;
}

export interface Manifest {
  version: number;
  /** `baseUrl`: the address relative urls start from (`WAYGRAPH_BASE_URL`, the config's `baseUrl`), when one is set. */
  project: { name: string; dir: string; waygraph: string; baseUrl?: string };
  /** The project's config file and what it resolves to (as JSON: a function shows as a word), when it has one. */
  config?: { file: string; values: unknown };
  checkpoints: string[];
  maps: string[];
  blocks: ManifestBlock[];
  /** The addresses each Checkpoint's page is known by: its Navs' urls and the urls its Blocks' verify checks. */
  pageUrls: Record<string, string[]>;
  /** What each Checkpoint's page shows, from its Read Blocks (version 2+). */
  readBlocks: ManifestReadBlock[];
  flows: ManifestFlow[];
  /** Every entry of the project's selector files (`_sel.ts`, `*.sel.ts`), file by file. */
  selectors: SelectorEntry[];
  skipped: ProjectScan["skipped"];
}

/** A Block's precondition or verify as data. */
function checksOf(list: Trait[] | ((input: never) => Trait[]) | undefined): ManifestCheck[] | "dynamic" {
  if (typeof list === "function") return "dynamic";
  return (list ?? []).map((t) => ({ name: t.name, ...(t.wants ? { wants: t.wants } : {}), ...(t.selector ? { selector: t.selector } : {}) }));
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
export function manifestFromScan(scan: ProjectScan, labels?: Labels): Manifest {
  const checkpoints = new Set<string>();
  const maps = new Set<string>();
  forgetSources();
  const blocks: ManifestBlock[] = scan.blocks.map((b) => {
    for (const t of [...b.from, ...b.to]) if (t !== "*") checkpoints.add(t);
    const map = b.map ?? mapGroupOf(b.file);
    const url = urlOf(b.block);
    if (map) maps.add(map);
    const source = spanOf(b.absFile, b.exportName);
    const instruction = (b.block as { instruction?: { precondition?: Trait[] | ((i: never) => Trait[]); verify?: Trait[] | ((o: never) => Trait[]) } }).instruction;
    return {
      id: `${b.file}#${b.exportName}`,
      name: b.name,
      exportName: b.exportName,
      kind: b.kind,
      description: b.description,
      from: b.from,
      to: b.to,
      requires: b.requires,
      expect: describeExpectations(b.block),
      file: b.file,
      ...(map ? { map } : {}),
      ...(url ? { url } : {}),
      ...(source ? { source } : {}),
      checks: { precondition: checksOf(instruction?.precondition), verify: checksOf(instruction?.verify) },
      selectors: selectorsUsed(b.absFile, b.exportName, scan.projectDir),
    };
  });
  const flows: ManifestFlow[] = scan.flows.map((f) => {
    const flow = f.flow as {
      blocks: () => { name: string; block: SomeBlock }[];
      memStub?: boolean;
      expectedFailureReason?: string;
      resetSession?: boolean;
      demoPace?: unknown;
    };
    const source = spanOf(f.absFile, f.exportName);
    return {
      id: `${f.file}#${f.exportName}`,
      exportName: f.exportName,
      file: f.file,
      ...(source ? { source } : {}),
      labels: labelsOf(labels, f.file, f.exportName),
      useCase: useCaseOf(f.file),
      steps: flow.blocks().map((s) => s.name),
      stepExpects: flow.blocks().map((s) => describeExpectations(s.block)),
      settings: {
        ...(flow.memStub ? { memStub: true as const } : {}),
        ...(flow.expectedFailureReason ? { expectedFailure: flow.expectedFailureReason } : {}),
        ...(flow.resetSession ? { sessionReset: true as const } : {}),
        ...(flow.demoPace !== undefined ? { demoPace: flow.demoPace } : {}),
      },
    };
  });
  const readBlocks: ManifestReadBlock[] = scan.readBlocks.map((r) => {
    let shape: Pick<ManifestReadBlock, "fields" | "fieldsError">;
    try {
      shape = { fields: readBlockShape(r.block, new MemPage()) };
    } catch (err) {
      shape = { fieldsError: messageOf(err) };
    }
    for (const t of r.block.from) if (t !== "*") checkpoints.add(t);
    const source = spanOf(r.absFile, r.exportName);
    return {
      id: `${r.file}#${r.exportName}`,
      name: r.block.name,
      exportName: r.exportName,
      description: r.block.description,
      from: [...r.block.from],
      requires: r.block.requires.map((k) => k.name),
      ...shape,
      file: r.file,
      ...(r.map ? { map: r.map } : {}),
      ...(source ? { source } : {}),
    };
  });
  return {
    version: MANIFEST_VERSION,
    project: { name: projectName(scan.projectDir), dir: scan.projectDir, waygraph: packageVersion() },
    checkpoints: [...checkpoints].sort(),
    maps: [...maps].sort(),
    blocks,
    pageUrls: pageUrls(scan.blocks),
    readBlocks,
    flows,
    selectors: selectorFilesUnder(scan.projectDir, walkDir).flatMap((file) => selectorEntries(join(scan.projectDir, file), file)),
    skipped: scan.skipped,
  };
}

/** Scans the project and returns its manifest. */
export async function buildManifest(
  projectDir: string,
  opts: ScanOptions & { baseUrl?: string | undefined; config?: Manifest["config"]; labels?: Labels | undefined } = {},
): Promise<Manifest> {
  const { baseUrl, config, labels, ...scanOpts } = opts;
  const manifest = manifestFromScan(await scanProject(projectDir, scanOpts), labels);
  return { ...manifest, ...(baseUrl ? { project: { ...manifest.project, baseUrl } } : {}), ...(config ? { config } : {}) };
}

