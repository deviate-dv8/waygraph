import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildManifest } from "../../manifest/manifest.js";
import { configAsJson, configFileOf, loadWaygraphConfig, resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { parseCommand } from "../args.js";

/** `waygraph manifest [project] [--out <file>]`: every Block, Flow and Checkpoint of the project, as JSON. */
export async function manifestCase(args: string[]): Promise<void> {
  const { values, positionals: positional } = parseCommand("manifest", { out: { type: "string", help: "Write to this file" } }, args.slice(1));
  const out = values.out;
  const proj = resolve(positional[0] ?? process.cwd());
  const file = configFileOf(proj);
  const loaded = await loadWaygraphConfig(proj);
  const config = file ? { file, values: configAsJson(loaded) } : undefined;
  const manifest = await buildManifest(proj, { baseUrl: await resolveBaseUrl(proj), config, labels: loaded?.labels });
  const json = JSON.stringify(manifest, null, 2) + "\n";
  if (!out) {
    process.stdout.write(json);
    return;
  }
  const target = resolve(proj, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json);
  console.error(`waygraph manifest: ${manifest.blocks.length} Block(s), ${manifest.flows.length} flow(s) -> ${target}`);
}
