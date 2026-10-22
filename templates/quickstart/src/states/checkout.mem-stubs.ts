import { registerMemStub } from "waygraph";
import { LoginCreds, SelectedItem } from "./checkout.mem-keys.js";

registerMemStub(LoginCreds.key, () => ({
  username: "standard_user",
  password: "secret_sauce",
}));
registerMemStub(SelectedItem.key, () => ({
  id: "sauce-labs-backpack",
  name: "Sauce Labs Backpack",
}));
