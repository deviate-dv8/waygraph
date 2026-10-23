import { checkpoint } from "waygraph";

/**
 * Checkpoint names match their own folder's page-slug (PascalCase) under the
 * Waygraph Map convention - `dashboard/` -> `Dashboard`, `docs/` -> `Docs`.
 * See openspec/changes/waygraph-map for why this is a naming convention, not
 * something any tool enforces.
 */
export const Dashboard = checkpoint("Dashboard");
export type Dashboard = typeof Dashboard;
export const Docs = checkpoint("Docs");
export type Docs = typeof Docs;
