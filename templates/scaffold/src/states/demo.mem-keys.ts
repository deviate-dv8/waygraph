import { keyGroup } from "waygraph";

/** The catalog row `add-item` / `remove-item` act on; `waygraph auto` fills it from `instanceOptions`. */
export const SelectedItem = keyGroup<{ id: string; name: string }>("demo.selectedItem");
