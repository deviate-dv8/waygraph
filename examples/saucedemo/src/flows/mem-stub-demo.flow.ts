import { Engine, withMemStub, registerMemStub } from "waygraph";
import { NavLoginBlock } from "../blocks/saucedemo-web/nav-login.block.js";
import { FillUsernameBlock } from "../blocks/saucedemo-web/methods/fill-username.method.block.js";
import { LoginCreds } from "../states/checkout.mem-keys.js";

/**
 * Test-only fixture for waygraph's own `--mem-stub` CLI flag
 * (tests/cli/mem-stub.spec.ts) - not part of the saucedemo showcase's own
 * demo/story. Registers a fake LoginCreds so `waygraph run
 * mem-stub-demo.flow.ts --mem-stub` succeeds with zero --data, proving the
 * registry + preflight fallback work against the real CLI, not just the
 * in-process engine tests in tests/core/mem-stub.spec.ts.
 */
registerMemStub(LoginCreds.key, () => ({
  username: "standard_user",
  password: "secret_sauce",
}));

const engine = new Engine();

export const memStubDemoFlow = withMemStub(
  engine.map().start().gotoPage(NavLoginBlock).method(FillUsernameBlock).end(),
);
