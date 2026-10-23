import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildManifest } from "../../manifest/manifest.js";

/** `waygraph manifest [project] [--out <file>]`: every Block, Flow and Checkpoint of the project, as JSON. */
export async function manifestCase(args: string[]): Promise<void> {
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const positional = args.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i] !== out);
  const proj = resolve(positional[0] ?? process.cwd());
  const manifest = await buildManifest(proj);
  const json = JSON.stringify(manifest, null, 2) + "\n";
  if (!out) {
    process.stdout.write(json);
    return;
  }
  const file = resolve(proj, out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, json);
  console.error(`waygraph manifest: ${manifest.blocks.length} Block(s), ${manifest.flows.length} flow(s) -> ${file}`);
}
