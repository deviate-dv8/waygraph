import { registerMemStub } from "waygraph";
import { SelectedItem } from "./demo.mem-keys.js";

registerMemStub(SelectedItem.key, () => ({ id: "alpha", name: "Alpha" }));
