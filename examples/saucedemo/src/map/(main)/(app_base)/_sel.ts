import { sel } from "waygraph";

/** The login page (`/`): typed builders where Playwright has a name for the element, a plain string where it hasn't. */
export const LoginSel = {
  username: sel.placeholder("Username", { exact: true }),
  password: sel.placeholder("Password", { exact: true }),
  loginButton: sel.role("button", { name: "Login" }),
  errorBanner: sel.testId("error", { attribute: "data-test" }),
};
