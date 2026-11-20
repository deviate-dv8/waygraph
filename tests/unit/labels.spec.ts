import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyLabels, normalizeLabels, labelsOf } from "../../src/manifest/labels.js";

const labels = {
  auth: ["src/flows/auth/**", "logoutFlow"],
  smoke: ["loginFlow", "src/flows/checkout/checkout.flow.ts"],
  typo: ["src/flow/nowhere/**"],
};

describe("flow labels", () => {
  it("a label covers flows by a glob over their files, or by export name", () => {
    assert.deepEqual(labelsOf(labels, "src/flows/auth/login.flow.ts", "loginFlow"), ["auth", "smoke"]);
    assert.deepEqual(labelsOf(labels, "src/flows/account.flow.ts", "logoutFlow"), ["auth"]);
    assert.deepEqual(labelsOf(labels, "src/flows/checkout/checkout.flow.ts", "checkoutFlow"), ["smoke"]);
    assert.deepEqual(labelsOf(labels, "src/flows/cart.flow.ts", "cartFlow"), []);
    assert.deepEqual(labelsOf(undefined, "src/flows/cart.flow.ts", "cartFlow"), []);
  });

  it("names the labels that cover no flow", () => {
    const flows = [
      { labels: ["auth"] },
      { labels: ["smoke"] },
    ];
    assert.deepEqual(emptyLabels(labels, flows), ["typo"]);
  });

  it("takes names, and { name, flows } objects, as labels", () => {
    assert.deepEqual(normalizeLabels(["auth", "smoke"]), { auth: [], smoke: [] });
    assert.deepEqual(normalizeLabels(["smoke", { name: "auth", flows: ["src/flows/auth/**"] }, { name: "cart" }]), { smoke: [], auth: ["src/flows/auth/**"], cart: [] });
    assert.deepEqual(normalizeLabels(undefined), {});
  });
});
