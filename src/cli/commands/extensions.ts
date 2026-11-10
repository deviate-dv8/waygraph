import { resolve } from "node:path";
import { loadWaygraphConfig } from "../../runtime/waygraph-config.js";
import { extensionInfo, resolveExtension } from "../../runtime/extensions.js";
import { parseCommand } from "../args.js";

export async function extensionsCase(args: string[]): Promise<void> {
  const { values, positionals: rest } = parseCommand("extensions", { update: { type: "boolean", help: "Download again" } }, args.slice(2));
  const update = values.update === true;
  if (args[1] !== "install") {
    console.error("usage: waygraph extensions install [project] [--update]");
    process.exit(1);
  }
  const proj = resolve(rest[0] ?? process.cwd());
  const config = await loadWaygraphConfig(proj);
  const specs = config?.extensions ?? [];
  // The demo's voice, when it needs a download of its own (a model): installed once per machine.
  const voice = config?.demo?.voice?.speaker;
  if (specs.length === 0 && !voice?.install) {
    console.log("waygraph extensions: no `extensions` (or a demo voice to install) in waygraph.config.* - nothing to install");
    return;
  }
  if (voice?.install) await voice.install({ update, log: (line) => console.log(line) });
  for (const spec of specs) {
    const dir = await resolveExtension(spec, proj, { update });
    const { name, version } = extensionInfo(dir);
    console.log(`waygraph extensions: ${name} ${version} -> ${dir}`);
  }
}
