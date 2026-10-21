// Relative to baseUrl in config/waygraph.config.ts (the (app_base) folder, set by `waygraph init`).
export const HOME_URL = "home/index.html";

export const DemoSel = {
  title: "h1",
  sub: "#sub",
  cartCount: "[data-test=cart-count]",
  catalog: "#catalog",
  clear: "[data-test=clear-cart]",
  addBtn: (id: string) => `[data-test=add-${id}]`,
  removeBtn: (id: string) => `[data-test=remove-${id}]`,
  verifiedBanner: "#verified-banner",
} as const;
