import { reads } from "waygraph";

/** What the docs page shows. */
export const DocsRead = reads("docs")<{ heading: string }>();
