// The CLI chain spec: "login then addToCart({...json...}) then checkoutFlow".

/** One segment: a Block or Flow name (or a `.flow.ts` path) and the `( … )` payload after it, as written. */
export interface ChainSegment {
  ref: string;
  payload?: string;
}

const isSpace = (c: string | undefined): boolean => c !== undefined && c.trim() === "";

/**
 * Splits a spec at each `then` between segments - not one inside a `( … )` payload or a quoted string, so
 * `a({"note":"and then"}) then b` is two segments.
 */
export function chainSegments(spec: string): ChainSegment[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < spec.length; i++) {
    const c = spec[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && spec.startsWith("then", i) && isSpace(spec[i - 1]) && isSpace(spec[i + 4])) {
      parts.push(spec.slice(start, i));
      start = i + 4;
    }
  }
  parts.push(spec.slice(start));
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((part) => {
      const open = part.indexOf("(");
      if (open === -1) return { ref: part };
      if (!part.endsWith(")")) throw new Error(`waygraph run --blocks: segment "${part}" opens "(" but doesn't end with ")"`);
      return { ref: part.slice(0, open).trim(), payload: part.slice(open + 1, -1).trim() };
    });
}

/** Splits a spec into segments, each a Block or Flow name with optional inline JSON for its mem. */
export function parseChainSpec(spec: string): { ref: string; json?: string }[] {
  return chainSegments(spec).map(({ ref, payload }) => {
    if (!/^[A-Za-z_$][\w-]*$/.test(ref)) {
      throw new Error(`waygraph run --blocks: could not parse segment "${ref}" - expected "blockName" or "blockName({...json...})"`);
    }
    return payload ? { ref, json: payload } : { ref };
  });
}
