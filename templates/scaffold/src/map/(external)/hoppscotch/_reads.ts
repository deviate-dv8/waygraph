import { reads } from "waygraph";

/** What Hoppscotch shows for the last request sent: its status line and response body. */
export const HoppscotchRead = reads("hoppscotch")<{ status: string; body: string }>();
