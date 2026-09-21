export const DASHBOARD_URL =
  process.env.WAYGRAPH_DASHBOARD_URL ??
  `http://${process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1"}:${process.env.WAYGRAPH_FIXTURE_PORT || "4277"}/dashboard.html`;

export const DashboardSel = {
  heading: "#dashboard-heading",
  widgetBtn: "#widget-btn",
  widgetOut: "#widget-out",
  goDocs: "#go-docs",
} as const;
