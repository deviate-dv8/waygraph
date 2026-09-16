import { test, expect } from "@playwright/test";
import { MemPage } from "waygraph";
import { viewerBlockedFlow } from "../src/flows/viewer-blocked.flow.js";
import { LoginCreds } from "../src/states/checkout.mem-keys.js";

// locked_out_user attempts the same login checkoutFlow's Owner (standard_user)
// just completed successfully, and is genuinely blocked - verified live against
// saucedemo.com. submit-login branches to LoginPage with the error banner visible.
test("viewerBlockedFlow: a locked-out user stays on LoginPage with error", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "locked_out_user", password: "secret_sauce" }));

  const result = await viewerBlockedFlow.run(mem);
  expect(result.__state).toBe("LoginPage");
});
