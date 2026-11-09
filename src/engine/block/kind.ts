// A Block's kind, from the marker its factory stamps on it: what the manifest lists, what a run event carries, what a
// viewer colours a step by.

/** Which factory made a Block: `nav`, `page`, `expect`, `method`, `api`, or a plain `block` (`defineBlock`). */
export type BlockKind = "nav" | "page" | "expect" | "method" | "api" | "block";

export function blockKindOf(block: object): BlockKind {
  const kind = (block as { __waygraphKind?: string }).__waygraphKind;
  if (kind === "nav" || kind === "page" || kind === "expect" || kind === "api") return kind;
  const salt = (block as { __waygraphSalt?: string }).__waygraphSalt;
  if (salt === "method" || salt === "api") return salt;
  return "block";
}
