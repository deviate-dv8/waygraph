// The CLI chain spec: "login then addToCart({...json...}) then checkoutFlow".

/** Splits a spec into segments, each a Block or Flow name with optional inline JSON for its mem. */
export function parseChainSpec(spec: string): { ref: string; json?: string }[] {
  return spec
    .split(/\bthen\b/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const m = /^([A-Za-z_$][\w-]*)\s*(?:\(([\s\S]*)\))?$/.exec(s);
      if (!m) {
        throw new Error(
          "waygraph run --blocks: could not parse segment \"" + s + "\" - expected \"blockName\" or \"blockName({...json...})\"",
        );
      }
      const ref = m[1]!;
      const json = m[2] ? m[2].trim() : undefined;
      return json ? { ref, json } : { ref };
    });
}
