import { defineNavBlock, Trait } from "waygraph";

/** Offline hello page - swap `url` for a real app route when you graduate. */
export const HOME_URL =
  'data:text/html,<!doctype html><html><body><h1>Hello Waygraph</h1><p id="sub">Scaffold demo</p></body></html>';

/**
 * Kind: Nav
 * Helper: defineNavBlock
 * Route: demo-web/  (synthetic "/")
 */
export const NavHomeBlock = defineNavBlock({
  name: "nav-home",
  description: "Opens the offline hello page (data: URL).",
  checkpoint: "Home",
  url: HOME_URL,
  verify: [Trait.text("h1", "Hello Waygraph")],
  stubBefore: {},
  stubAfter: {
    title: { selector: "h1", label: "Home heading", duration: true },
  },
  stubOnError: {
    title: { selector: "h1", label: "Home heading at failure" },
  },
});
