import { test, expect } from "@playwright/test";
import { memStubValue } from "../../src/live/auto-explore-run.js";
import { key } from "../../src/engine/mem/mem.js";
import { registerMemStub } from "../../src/engine/mem/mem-stub.js";

test.describe("live sessions default a required key from the project's mem stubs", () => {
  test("a key with a registered stub gets the stub's value", () => {
    const creds = key<{ username: string }>("default-seed.credentials");
    registerMemStub(creds, () => ({ username: "from-stub" }));
    expect(memStubValue(creds)).toEqual({ username: "from-stub" });
  });

  test("a key without a stub stays unset, even when its name looks like a credential", () => {
    expect(memStubValue(key<string>("login-email"))).toBeUndefined();
    expect(memStubValue(key<string>("credentials"))).toBeUndefined();
  });
});
