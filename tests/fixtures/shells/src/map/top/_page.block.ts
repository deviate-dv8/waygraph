import { definePageBlock } from "../../../../../../dist/index.js";

// A header on pages that live in different folders: a bare shell naming them.
export const Header = definePageBlock({
  name: "header-shell",
  covers: ["ShellDocs", "ShellSettings"],
  links: (self) => ({ home: self.link({ to: "ShellApp", click: "#home" }) }),
});
