// Every flow but the exclusive ones, in parallel (`waygraph test --flows`), then one access test per account.
import { envString } from "../../engine/env.js";
import { registerAccessTests } from "./access.js";
import { registerFlowTests } from "./register.js";

await registerFlowTests(false);
await registerAccessTests(envString("WAYGRAPH_PROJECT_DIR") ?? process.cwd());
