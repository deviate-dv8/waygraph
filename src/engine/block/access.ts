// Who's given a Block (`for`): the accounts a page opens for, a Method's button shows for, a layout link shows for.
// Without `for`, every account. The access tests and `waygraph check` read it.
import type { Account } from "../flow/account.js";
import { mark } from "./mark.js";

/** Records who `block` is given to, when it says. */
export function markFor(block: object, given: readonly Account[] | undefined): void {
  if (given) mark(block, "__waygraphFor", given.map((a) => a.name));
}

/** The names of the accounts `block` is given to; undefined: every account. */
export function givenTo(block: object): readonly string[] | undefined {
  return (block as { __waygraphFor?: readonly string[] }).__waygraphFor;
}
