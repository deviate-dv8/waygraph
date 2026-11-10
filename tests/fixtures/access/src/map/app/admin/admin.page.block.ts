import { definePageBlock, type Trait } from "waygraph";
import { Admin } from "../../../app.js";
import { AdminUser } from "../../../accounts/accounts.js";

/** The admin title, retried for two seconds: a page that doesn't open says so soon. */
const adminTitle: Trait = {
  name: "admin-title",
  wants: "the admin title",
  timeoutMs: 2000,
  async check(page) {
    return page.locator("#admin-title").isVisible();
  },
};

export const AdminPage = definePageBlock({
  name: "admin-page",
  checkpoint: Admin,
  url: "https://app.test/admin",
  verify: [adminTitle],
  for: [AdminUser],
});
