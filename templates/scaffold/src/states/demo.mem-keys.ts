import { keyGroup } from "waygraph";

/**
 * Which catalog row `add-item` / `remove-item` act on.
 * `waygraph auto` fills this via Effect `instanceOptions` (one menu row per live button).
 */
export const SelectedItem = keyGroup<{ id: string; name: string }>("demo.selectedItem");
