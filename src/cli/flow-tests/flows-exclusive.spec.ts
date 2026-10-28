// map({ exclusive: true }) flows: one at a time, after every other flow (`waygraph test --flows`).
import { test } from "@playwright/test";
import { registerFlowTests } from "./register.js";

test.describe.configure({ mode: "serial" });
await registerFlowTests(true);
