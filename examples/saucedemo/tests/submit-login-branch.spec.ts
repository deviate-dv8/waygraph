import { test, expect } from "@playwright/test";
import { MemPage } from "waygraph";
import { engine } from "../config/waygraph.config.js";
import { NavLoginBlock } from "../src/blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../src/blocks/saucedemo-web/methods/fill-username.method.block.js";
import { FillPasswordBlock } from "../src/blocks/saucedemo-web/methods/fill-password.method.block.js";
import { SubmitLoginBlock } from "../src/blocks/saucedemo-web/methods/submit-login.method.block.js";
import { SaucedemoKeys } from "../src/states/checkout.mem-keys.js";

test("submit-login: wrong password branches to LoginPage with error banner", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "wrong-password" });

  const flow = engine
    .map()
    .start()
    .gotoPage(NavLoginBlock)
    .method(FillUsernameBlock)
    .method(FillPasswordBlock)
    .method(SubmitLoginBlock)
    .end();
  const result = await flow.run(mem);

  expect(result.__state).toBe("LoginPage");
});

test("submit-login: good password branches to LoggedIn", async () => {
  const mem = new MemPage();
  mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });

  const flow = engine
    .map()
    .start()
    .gotoPage(NavLoginBlock)
    .method(FillUsernameBlock)
    .method(FillPasswordBlock)
    .method(SubmitLoginBlock)
    .end();
  const result = await flow.run(mem);

  expect(result.__state).toBe("LoggedIn");
});
