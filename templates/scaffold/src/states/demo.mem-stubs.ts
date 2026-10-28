import { registerMemStub } from "waygraph";
import { DemoKeys } from "./demo.mem-keys.js";

registerMemStub(DemoKeys.selectedItem, () => ({ id: "alpha", name: "Alpha" }));
