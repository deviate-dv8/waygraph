import { test, expect } from "@playwright/test";
import { defaultMemValueForKey } from "../../src/auto-explore-run.js";

test.describe("defaultMemValueForKey (PIA login-email bug)", () => {
  test("exact credential keys get saucedemo defaults", () => {
    expect(defaultMemValueForKey("login-credentials")).toEqual({
      username: "standard_user",
      password: "secret_sauce",
    });
    expect(defaultMemValueForKey("credentials")).toEqual({
      username: "standard_user",
      password: "secret_sauce",
    });
    expect(defaultMemValueForKey("saucedemo.credentials")).toEqual({
      username: "standard_user",
      password: "secret_sauce",
    });
  });

  test("login-email and other login* string keys stay unset", () => {
    expect(defaultMemValueForKey("login-email")).toBeUndefined();
    expect(defaultMemValueForKey("login")).toBeUndefined();
    expect(defaultMemValueForKey("user-login")).toBeUndefined();
    expect(defaultMemValueForKey("email")).toBeUndefined();
  });
});
