import { test, expect } from "@playwright/test";
import { memStubValue } from "../../src/live/auto/mem.js";
import { keys, MemKey } from "../../src/engine/mem/mem.js";
import { registerMemStub } from "../../src/engine/mem/mem-stub.js";

test.describe("live sessions default a required key from the project's mem stubs", () => {
  test("a key with a registered stub gets the stub's value", () => {
    const DefaultSeedKeys = keys("default-seed")<{
      credentials: { username: string };
    }>();
    registerMemStub(DefaultSeedKeys.credentials, () => ({ username: "from-stub" }));
    expect(memStubValue(DefaultSeedKeys.credentials)).toEqual({ username: "from-stub" });
  });

  test("a key without a stub stays unset, even when its name looks like a credential", () => {
    expect(memStubValue(new MemKey<string>("login-email"))).toBeUndefined();
    expect(memStubValue(new MemKey<string>("credentials"))).toBeUndefined();
  });
});
