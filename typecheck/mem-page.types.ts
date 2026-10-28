import { MemPage, keys } from "../src/engine/mem/mem.js";

const AuthKeys = keys("auth")<{
  email: string;
  creds: { username: string; password: string };
}>();

const ChatKeys = keys("chat")<{
  count: number;
}>();
const mem = new MemPage();

// get() infers the key's type with no cast.
const email: string = mem.get(AuthKeys.email);
void email;
const count: number = mem.get(ChatKeys.count);
void count;

// A mismatched type assignment must fail to compile.
// @ts-expect-error - EmailKey is MemKey<string>, not assignable to number
const _wrongType: number = mem.get(AuthKeys.email);
void _wrongType;

// setAll checks each pair independently - both of these are valid.
mem.setAll([AuthKeys.email, "alice@test.com"], [ChatKeys.count, 3]);

// @ts-expect-error - CountKey is MemKey<number>, "not a number" is not a number
mem.setAll([AuthKeys.email, "alice@test.com"], [ChatKeys.count, "not a number"]);

// A shaped key takes only its own shape.
mem.setAll([AuthKeys.creds, { username: "alice", password: "hunter2" }] as const);
mem.set(AuthKeys.creds, { username: "alice", password: "hunter2" });

// @ts-expect-error - missing "password" from the required shape
mem.set(AuthKeys.creds, { username: "alice" });

// @ts-expect-error - EmailKey is MemKey<string>, a lone MemKey needs a second value argument
mem.set(AuthKeys.email);
