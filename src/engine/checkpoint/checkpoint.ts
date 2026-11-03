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
 * Where every flow begins, before its first step: the Checkpoint a Block that leads off a flow starts `from`, and the one
 * a Block that sends the run back to the beginning (a sign-out, a fresh session) goes `to`. A value and a type, like any
 * Checkpoint, so no project spells out the tag it stands for.
 * @example defineMethodBlock({ name: "open-form", from: Start, to: Form, ... })
 * @example defineMethodBlock({ name: "sign-out", from: Home, to: Start, ... })
 */
export const Start = checkpoint("__start__");
export type Start = typeof Start;
