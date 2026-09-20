import type { Checkpoint } from "waygraph";

/**
 * Checkpoint names match their own folder's page-slug (PascalCase) under the
 * Waygraph Map convention - `dashboard/` -> `Dashboard`, `docs/` -> `Docs`.
 * See openspec/changes/waygraph-map for why this is a naming convention, not
 * something any tool enforces.
 */
export type Dashboard = Checkpoint<"Dashboard">;
export type Docs = Checkpoint<"Docs">;
