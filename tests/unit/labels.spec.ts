import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyLabels, labelsOf } from "../../src/manifest/labels.js";

const labels = {
  auth: ["src/flows/auth/**", "logoutFlow"],
  smoke: ["loginFlow", "src/flows/checkout.flow.ts"],
  typo: ["src/flow/nowhere/**"],
};

describe("flow labels", () => {
  it("a label covers flows by a glob over their files, or by export name", () => {
    assert.deepEqual(labelsOf(labels, "src/flows/auth/login.flow.ts", "loginFlow"), ["auth", "smoke"]);
    assert.deepEqual(labelsOf(labels, "src/flows/account.flow.ts", "logoutFlow"), ["auth"]);
    assert.deepEqual(labelsOf(labels, "src/flows/checkout.flow.ts", "checkoutFlow"), ["smoke"]);
    assert.deepEqual(labelsOf(labels, "src/flows/cart.flow.ts", "cartFlow"), []);
    assert.deepEqual(labelsOf(undefined, "src/flows/cart.flow.ts", "cartFlow"), []);
  });

  it("names the labels that cover no flow", () => {
    const flows = [
      { file: "src/flows/auth/login.flow.ts", exportName: "loginFlow" },
      { file: "src/flows/checkout.flow.ts", exportName: "checkoutFlow" },
    ];
    assert.deepEqual(emptyLabels(labels, flows), ["typo"]);
  });
});
