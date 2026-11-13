import { test, expect } from "@playwright/test";
import { MemPage } from "waygraph";
import { engine } from "../config/waygraph.config.js";
import { Login } from "../src/map/(shop)/_page.block.js";
import { SaucedemoKeys } from "../src/states/checkout.mem-keys.js";

test("submit-login: wrong password branches to LoginPage with error banner", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "wrong-password" });

  const flow = engine
    .map()
    .gotoPage(Login)
    .method(Login.do.fillUsername)
    .method(Login.do.fillPassword)
    .method(Login.do.submitLogin);
  const result = await flow.run(mem);

  expect(result.__state).toBe("LoginPage");
});

test("submit-login: good password branches to InventoryPage", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });

  const flow = engine
    .map()
    .gotoPage(Login)
    .method(Login.do.fillUsername)
    .method(Login.do.fillPassword)
    .method(Login.do.submitLogin);
  const result = await flow.run(mem);

  expect(result.__state).toBe("InventoryPage");
});
