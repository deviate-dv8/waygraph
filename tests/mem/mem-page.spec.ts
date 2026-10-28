import { test, expect } from "@playwright/test";
import { MemKey, MemPage, keys } from "../../src/engine/mem/mem.js";

test.describe("MemPage", () => {
  test("get after set returns the exact value written", () => {
    const mem = new MemPage();
    const OrgKeys = keys("org")<{
      id: string;
    }>();
    mem.set(OrgKeys.id, "org_123");

    expect(mem.get(OrgKeys.id)).toBe("org_123");
  });

  test("get on an unset key throws, naming the key", () => {
    const mem = new MemPage();
    const NeverKeys = keys("never")<{
      set: string;
    }>();
    expect(() => mem.get(NeverKeys.set)).toThrow(/never\.set/);
  });

  test("two keys with the same debug name never collide", () => {
    const mem = new MemPage();
    const KeyA = new MemKey<string>("duplicate.name");
    const KeyB = new MemKey<string>("duplicate.name");

    mem.set(KeyA, "from-a");
    mem.set(KeyB, "from-b");

    expect(mem.get(KeyA)).toBe("from-a");
    expect(mem.get(KeyB)).toBe("from-b");
  });

  test("setAll sets several keys in one call", () => {
    const mem = new MemPage();
    const { username: UsernameKey, password: PasswordKey } = keys("login")<{ username: string; password: string }>();

    mem.setAll([UsernameKey, "standard_user"], [PasswordKey, "secret_sauce"]);

    expect(mem.get(UsernameKey)).toBe("standard_user");
    expect(mem.get(PasswordKey)).toBe("secret_sauce");
  });

  test("a namespace field holds a shaped value, usable via setAll", () => {
    const AuthKeys = keys("auth")<{
      creds: { username: string; password: string };
    }>();
    const mem = new MemPage();

    mem.setAll([AuthKeys.creds, { username: "standard_user", password: "secret_sauce" }] as const);

    expect(mem.get(AuthKeys.creds)).toEqual({ username: "standard_user", password: "secret_sauce" });
  });

  test("a namespace field is the same key every time it is read, named <namespace>.<field>", () => {
    const AuthKeys = keys("auth")<{ creds: { username: string; password: string } }>();
    expect(AuthKeys.creds).toBe(AuthKeys.creds);
    expect(AuthKeys.creds.name).toBe("auth.creds");
  });

  test("update reads, transforms, and writes back", () => {
    const mem = new MemPage();
    const { recipients: ListKey } = keys("mail")<{ recipients: string[] }>();

    mem.set(ListKey, ["alice@test.com"]);
    mem.update(ListKey, (list) => [...list, "bob@test.com"]);

    expect(mem.get(ListKey)).toEqual(["alice@test.com", "bob@test.com"]);
  });
});
