/** Offline catalog URL — HTTP fixture server (not file://; Flatpak Chromium blocks /tmp file URLs). */
export const HOME_URL =
  process.env.WAYGRAPH_HOME_URL ??
  `http://${process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1"}:${process.env.WAYGRAPH_FIXTURE_PORT || "4177"}/home.html`;

export const DemoSel = {
  title: "h1",
  sub: "#sub",
  cartCount: "[data-test=cart-count]",
  catalog: "#catalog",
  clear: "[data-test=clear-cart]",
  addBtn: (id: string) => `[data-test=add-${id}]`,
  removeBtn: (id: string) => `[data-test=remove-${id}]`,
} as const;
