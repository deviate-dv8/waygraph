import { test, expect } from "@playwright/test";
import { MemPage } from "waygraph";
import { checkoutFlow } from "../src/flows/checkout.flow.js";

// Credentials deliberately never set - proves the flow fails before opening a
// tab or touching saucedemo.com at all, not deep inside submit-login's act.
test("forgetting credentials fails at preflight, not mid-flow", async () => {
  const mem = new MemPage(); // no setAll() call

  await expect(checkoutFlow.run(mem)).rejects.toThrow(
    /preflight.*"saucedemo\.credentials"/,
  );
});
