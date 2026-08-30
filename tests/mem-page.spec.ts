import { test, expect } from "@playwright/test";
import { MemPage, key, keyGroup } from "../src/mem-page.js";

test.describe("MemPage", () => {
  test("get after set returns the exact value written", () => {
    const mem = new MemPage();
    const OrgIdKey = key<string>("org.id");

    mem.set(OrgIdKey, "org_123");

    expect(mem.get(OrgIdKey)).toBe("org_123");
  });

  test("get on an unset key throws, naming the key", () => {
    const mem = new MemPage();
    const NeverSetKey = key<string>("never.set");

    expect(() => mem.get(NeverSetKey)).toThrow(/never\.set/);
  });

  test("two keys with the same debug name never collide", () => {
    const mem = new MemPage();
    const KeyA = key<string>("duplicate.name");
    const KeyB = key<string>("duplicate.name");

    mem.set(KeyA, "from-a");
    mem.set(KeyB, "from-b");

    expect(mem.get(KeyA)).toBe("from-a");
    expect(mem.get(KeyB)).toBe("from-b");
  });

  test("setAll sets several keys in one call", () => {
    const mem = new MemPage();
    const UsernameKey = key<string>("username");
    const PasswordKey = key<string>("password");

    mem.setAll([UsernameKey, "standard_user"], [PasswordKey, "secret_sauce"]);

    expect(mem.get(UsernameKey)).toBe("standard_user");
    expect(mem.get(PasswordKey)).toBe("secret_sauce");
  });

  test("keyGroup bundles a shaped value under one key, usable via setAll", () => {
    const LoginCreds = keyGroup<{ username: string; password: string }>("auth.creds");
    const mem = new MemPage();

    mem.setAll(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

    expect(mem.get(LoginCreds.key)).toEqual({ username: "standard_user", password: "secret_sauce" });
  });

  test("set() also accepts a keyGroup pair directly - no setAll needed for just one", () => {
    const LoginCreds = keyGroup<{ username: string; password: string }>("auth.creds");
    const mem = new MemPage();

    mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

    expect(mem.get(LoginCreds.key)).toEqual({ username: "standard_user", password: "secret_sauce" });
  });

  test("update reads, transforms, and writes back", () => {
    const mem = new MemPage();
    const ListKey = key<string[]>("recipients");

    mem.set(ListKey, ["alice@test.com"]);
    mem.update(ListKey, (list) => [...list, "bob@test.com"]);

    expect(mem.get(ListKey)).toEqual(["alice@test.com", "bob@test.com"]);
  });
});
