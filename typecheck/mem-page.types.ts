import { MemPage, key, keyGroup } from "../src/mem-page.js";

const EmailKey = key<string>("auth.email");
const CountKey = key<number>("chat.count");

const mem = new MemPage();

// get() infers the key's type with no cast.
const email: string = mem.get(EmailKey);
void email;
const count: number = mem.get(CountKey);
void count;

// A mismatched type assignment must fail to compile.
// @ts-expect-error - EmailKey is MemKey<string>, not assignable to number
const _wrongType: number = mem.get(EmailKey);
void _wrongType;

// setAll checks each pair independently - both of these are valid.
mem.setAll([EmailKey, "alice@test.com"], [CountKey, 3]);

// @ts-expect-error - CountKey is MemKey<number>, "not a number" is not a number
mem.setAll([EmailKey, "alice@test.com"], [CountKey, "not a number"]);

// keyGroup: the factory only accepts its own shape.
const LoginCreds = keyGroup<{ username: string; password: string }>("auth.creds");
mem.setAll(LoginCreds({ username: "alice", password: "hunter2" }));

// @ts-expect-error - missing "password" from the required shape
LoginCreds({ username: "alice" });

// set() takes a keyGroup pair directly too.
mem.set(LoginCreds({ username: "alice", password: "hunter2" }));

// @ts-expect-error - EmailKey is MemKey<string>, a lone MemKey needs a second value argument
mem.set(EmailKey);
