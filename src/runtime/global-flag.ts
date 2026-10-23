// Options any command takes (`--config`, `--env`): read with node:util's parseArgs and taken out of argv, so they never
// reach a command that forwards its arguments (waygraph test -> playwright test).
import { parseArgs } from "node:util";

/** The value of `--<name> <v>` / `--<name>=<v>` (the last one wins) and argv without it. */
export function takeGlobalFlag(argv: string[], name: string): { value: string | undefined; rest: string[] } {
  const { tokens } = parseArgs({ args: argv, options: { [name]: { type: "string" } }, strict: false, allowPositionals: true, tokens: true });
  let value: string | undefined;
  const drop = new Set<number>();
  for (const t of tokens) {
    if (t.kind !== "option" || t.name !== name || typeof t.value !== "string") continue;
    value = t.value;
    drop.add(t.index);
    if (!t.inlineValue) drop.add(t.index + 1);
  }
  return { value, rest: argv.filter((_, i) => !drop.has(i)) };
}
