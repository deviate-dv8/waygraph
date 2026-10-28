// Every flow but the exclusive ones, in parallel (`waygraph test --flows`).
import { registerFlowTests } from "./register.js";

await registerFlowTests(false);
