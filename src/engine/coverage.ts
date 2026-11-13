// What the pilot's coverage view is given: the registered selectors and the pages' paths (made by analysis, painted by the demo layer).

/** A selector the pilot's coverage view can outline, with the name it is registered under (`LoginSel.submit`; empty for one written in a Block). */
export interface CoverageEntry {
  selector: string;
  name: string;
}

/** What the live browser's coverage view needs: the project's registered selectors (named ones first) and the pages' paths. */
export interface CoveragePayload {
  entries: CoverageEntry[];
  /** The pages' addresses, `/items/:id` for a param. */
  paths: string[];
}
