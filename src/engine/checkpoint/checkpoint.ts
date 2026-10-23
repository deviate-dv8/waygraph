// The states a flow moves between. A Checkpoint is just its tag; flows declare them once as values.

/**
 * A Checkpoint is identified solely by its string tag - a phantom marker with no
 * embedded data. Two Checkpoints with the same tag are the same state everywhere.
 */
export type Checkpoint<Tag extends string> = { readonly __state: Tag };

/**
 * Builds a Checkpoint - spells `__state` for you so no call site does it by hand.
 * @example resolve: () => checkpoint("LoggedIn")
 */
export function checkpoint<Tag extends string>(tag: Tag): Checkpoint<Tag> {
  return { __state: tag };
}

/**
 * The type every entry Block's `In` must be - `runGraph` always seeds a fresh
 * run with `checkpoint("__start__")` as the fake initial input, so a Block
 * meant to lead off a Flow needs exactly this type. Exported so no project
 * has to know or hand-type the `"__start__"` literal itself - the same reason
 * `checkpoint()` exists instead of every call site spelling `{ __state: tag }`
 * by hand.
 * @example export const LoginBlock: Block<Start, LoggedIn> = { ... }
 */
export type Start = Checkpoint<"__start__">;
