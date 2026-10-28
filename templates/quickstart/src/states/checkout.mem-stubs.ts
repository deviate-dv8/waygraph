import { registerMemStub } from "waygraph";
import { SaucedemoKeys } from "./checkout.mem-keys.js";

registerMemStub(SaucedemoKeys.credentials, () => ({
  username: "standard_user",
  password: "secret_sauce",
}));
registerMemStub(SaucedemoKeys.selectedItem, () => ({
  id: "sauce-labs-backpack",
  name: "Sauce Labs Backpack",
}));
