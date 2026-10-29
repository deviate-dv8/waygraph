// Every command's flags, read with node:util's parseArgs from the command's own table, which also prints its help. An
// unknown flag or a flag missing its value stops the command with the reason.
import { messageOf } from "../engine/errors.js";
import { parseArgs } from "node:util";

export interface OptionSpec {
  type: "boolean" | "string";
  multiple?: boolean;
  /** How the value reads in the help: `<url>`, `N`. */
  value?: string;
  help: string;
}

export type OptionTable = Readonly<Record<string, OptionSpec>>;

/** What a table parses to: a boolean, a string, or (multiple) a list, per flag; absent when not given. */
export type ParsedOptions<T extends OptionTable> = {
  [K in keyof T]?: T[K]["type"] extends "boolean" ? boolean : T[K] extends { multiple: true } ? string[] : string;
};

export interface ParsedCommand<T extends OptionTable> {
  values: ParsedOptions<T>;
  positionals: string[];
  tokens: ReturnType<typeof parseArgs>["tokens"] & {};
}

export function parseCommand<T extends OptionTable>(command: string, table: T, argv: string[]): ParsedCommand<T> {
  const options = Object.fromEntries(Object.entries(table).map(([name, o]) => [name, { type: o.type, multiple: o.multiple === true }]));
  try {
    const { values, positionals, tokens } = parseArgs({ args: argv, options, allowPositionals: true, strict: true, tokens: true });
    return { values: values as ParsedOptions<T>, positionals, tokens };
  } catch (err) {
    console.error(`waygraph ${command}: ${messageOf(err)}`);
    process.exit(1);
  }
}

/** The table as aligned help lines (`--name <value>  help`). */
export function helpLines(table: OptionTable, indent = 2): string {
  const rows = Object.entries(table).map(([name, o]) => [`--${name}${o.value ? " " + o.value : ""}`, o.help] as const);
  const width = Math.max(...rows.map(([flag]) => flag.length)) + 2;
  return rows.map(([flag, help]) => " ".repeat(indent) + flag.padEnd(width) + help).join("\n");
}
