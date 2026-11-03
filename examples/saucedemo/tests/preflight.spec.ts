import { test, expect } from "@playwright/test";
import { MemPage } from "waygraph";
import { engine } from "../config/waygraph.config.js";
import { checkoutFlow } from "../src/flows/checkout.flow.js";

// Credentials deliberately never set, and no mem stubs (checkoutFlow itself has memStub: true, which would fill them) -
// proves the flow fails before opening a tab or touching saucedemo.com at all, not deep inside submit-login's act.
test("forgetting credentials fails at preflight, not mid-flow", async () => {
  const withoutStubs = engine.map().flow(checkoutFlow);

  await expect(withoutStubs.run(new MemPage())).rejects.toThrow(
    /preflight.*"saucedemo\.credentials"/,
  );
});
