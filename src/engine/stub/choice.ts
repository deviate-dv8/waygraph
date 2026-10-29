// A narration option with a fixed set of values (a ring's tone, a device preset): exactly one of them, or a clear error.

/** `raw` when it is one of `allowed`; undefined when it wasn't given; anything else throws, naming the allowed values. */
export function choice<const T extends string>(what: string, raw: unknown, allowed: readonly T[]): T | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "string" && (allowed as readonly string[]).includes(raw)) return raw as T;
  throw new Error(`waygraph: ${what} ${JSON.stringify(raw)} isn't one of ${allowed.map((a) => `"${a}"`).join(", ")}`);
}
