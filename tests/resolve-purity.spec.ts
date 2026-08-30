import { test, expect } from "@playwright/test";
import { checkpoint } from "../src/types.js";

test.describe("resolve purity", () => {
  test("resolve produces the same output Checkpoint given the same evidence, every time", () => {
    // A representative resolve implementation - deterministic by construction,
    // since its only input is `observed` and it has no page/mem to vary its answer.
    const resolve = (observed: "url-changed" | "error-text") =>
      observed === "url-changed" ? checkpoint("Authed") : checkpoint("LoginFailed");

    const first = resolve("url-changed");
    const second = resolve("url-changed");

    expect(first).toEqual(second);
    expect(resolve("error-text")).toEqual(checkpoint("LoginFailed"));
  });
});
