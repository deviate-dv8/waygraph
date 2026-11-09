import { reads } from "waygraph";

/** What the fixture's page shows. */
export const PageShows = reads("page")<{ title: string }>();
