import { keys } from "waygraph";

export const DemoKeys = keys("demo")<{
  /** The catalog row `add-item` / `remove-item` act on; `waygraph auto` fills it from `instanceOptions`. */
  selectedItem: { id: string; name: string };
}>();
