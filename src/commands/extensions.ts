import { resolve } from "node:path";
import { loadWaygraphConfig } from "../runtime/config.js";
import { extensionInfo, resolveExtension } from "../runtime/extensions.js";

export async function extensionsCase(args: string[]): Promise<void> {
  const update = args.includes("--update");
  const rest = args.slice(2).filter((a) => a !== "--update");
  if (args[1] !== "install") {
    console.error("usage: waygraph extensions install [project] [--update]");
    process.exit(1);
  }
  const proj = resolve(rest[0] ?? process.cwd());
  const specs = (await loadWaygraphConfig(proj))?.extensions ?? [];
  if (specs.length === 0) {
    console.log("waygraph extensions: no `extensions` in waygraph.config.* - nothing to install");
    return;
  }
  for (const spec of specs) {
    const dir = await resolveExtension(spec, proj, { update });
    const { name, version } = extensionInfo(dir);
    console.log(`waygraph extensions: ${name} ${version} -> ${dir}`);
  }
}
