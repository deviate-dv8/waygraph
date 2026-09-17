import { test, expect } from "@playwright/test";
import { MemPage, checkpoint } from "waygraph";
import { exampleFlow } from "../src/flows/example.flow.js";

test("example flow reaches HomeVerified", async ({ context }) => {
  const result = await exampleFlow.run(context, new MemPage());
  expect(result).toEqual(checkpoint("HomeVerified"));
});
