import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { configAsJson } from "../../src/runtime/waygraph-config.js";

describe("configAsJson", () => {
  it("keeps data, and says what a function, a pattern or an instance is", () => {
    function setup() {}
    assert.deepEqual(
      configAsJson({ baseUrl: "http://localhost:3000", workers: 6, video: { dir: "~/v" }, globalSetup: setup, grep: /smoke/, at: new Date(0), skip: undefined, list: [1, () => 2] }),
      { baseUrl: "http://localhost:3000", workers: 6, video: { dir: "~/v" }, globalSetup: "(function setup)", grep: "/smoke/", at: "(Date)", list: [1, "(function)"] },
    );
  });
});
