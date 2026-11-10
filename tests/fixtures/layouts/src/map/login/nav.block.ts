import { defineNavBlock } from "../../../../../../dist/index.js";
import { Login } from "../../pages.js";

export const NavLogin = defineNavBlock({ name: "nav-login", checkpoint: Login, url: "https://app.test/login" });
