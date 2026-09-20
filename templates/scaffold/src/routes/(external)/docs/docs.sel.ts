export const DOCS_URL =
  process.env.WAYGRAPH_DOCS_URL ??
  `http://${process.env.WAYGRAPH_FIXTURE_HOST || "127.0.0.1"}:${process.env.WAYGRAPH_FIXTURE_PORT || "4177"}/docs.html`;

export const DocsSel = {
  heading: "#docs-heading",
} as const;
