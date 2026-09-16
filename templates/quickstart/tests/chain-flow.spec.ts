import { test, expect } from "@playwright/test";
import { MemPage, checkpoint, chainFlow } from "waygraph";
import { loginFlow } from "../src/flows/login.flow.js";
import { viewerBlockedFlow } from "../src/flows/viewer-blocked.flow.js";
import { LoginCreds, ViewerCreds } from "../src/states/checkout.mem-keys.js";

test("chainFlow: Episode 1 signs in, Episode 2 blocked login genuinely fails", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));
  mem.set(ViewerCreds({ username: "locked_out_user", password: "secret_sauce" }));

  const combined = chainFlow(loginFlow, viewerBlockedFlow);

  await expect(combined.run(mem)).rejects.toThrow(/viewer-login/);
});

test("episode 1 alone: standard_user reaches inventory", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

  const result = await loginFlow.run(mem);

  expect(result).toEqual(checkpoint("LoggedIn"));
});

test("chainFlow blocks() lists the flattened episode chain in order", () => {
  expect(loginFlow.title).toBe("Sign In");
  expect(viewerBlockedFlow.title).toBe("Viewer: Blocked Login Attempt");

  const blocks = chainFlow(loginFlow, viewerBlockedFlow).blocks();
  expect(blocks.map((b) => b.name)).toEqual([
    "nav-login",
    "submit-login",
    "nav-login",
    "viewer-login",
  ]);
  expect(blocks[0]!.resetSessionBefore).toBeUndefined();
  expect(blocks[2]!.resetSessionBefore).toBe(true);
});
