import type { Checkpoint } from "../src/types.js";

// Two Checkpoints with the same literal tag are assignable to each other.
declare const authedA: Checkpoint<"Authed">;
declare const authedB: Checkpoint<"Authed">;
const _sameTagOk: Checkpoint<"Authed"> = authedA;
void _sameTagOk;
const _sameTagOk2: Checkpoint<"Authed"> = authedB;
void _sameTagOk2;

// A mismatched tag must NOT be assignable - this line should fail to compile.
declare const loggedOut: Checkpoint<"LoggedOut">;
// @ts-expect-error - "LoggedOut" is not assignable to Checkpoint<"Authed">
const _mismatchedTag: Checkpoint<"Authed"> = loggedOut;
void _mismatchedTag;
