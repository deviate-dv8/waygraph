import { test, expect } from "@playwright/test";
import { MemPage, Engine, start, end } from "waygraph";
import { NavLoginBlock } from "../src/blocks/saucedemo-web/nav-login.block.js";
import { SubmitLoginActionBlock } from "../src/blocks/saucedemo-web/methods/submit-login.method.block.js";
import { LoginCreds } from "../src/states/checkout.mem-keys.js";

test("submit-login: wrong password branches to LoginPage with error banner", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "wrong-password" }));

  const engine = new Engine();
  const flow = engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end]);
  const result = await flow.run(mem);

  expect(result.__state).toBe("LoginPage");
});

test("submit-login: good password branches to LoggedIn", async () => {
  const mem = new MemPage();
  mem.set(LoginCreds({ username: "standard_user", password: "secret_sauce" }));

  const engine = new Engine();
  const flow = engine.defineFlow([start, NavLoginBlock, SubmitLoginActionBlock, end]);
  const result = await flow.run(mem);

  expect(result.__state).toBe("LoggedIn");
});
