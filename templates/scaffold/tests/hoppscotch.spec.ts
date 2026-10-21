import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { MemPage, checkpoint } from "waygraph";
import { hoppscotchRequestFlow } from "../src/flows/hoppscotch-request.flow.js";
import { RequestUrl } from "../src/states/demo.mem-keys.js";

test("hoppscotchRequestFlow: sends a CORS-less local request through the extension", async () => {
  test.skip(!process.env.WAYGRAPH_EXTENSIONS, 'add extensions: ["hoppscotch"] to waygraph.config.ts to run this');
  const server = createServer((_, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const mem = new MemPage();
    mem.set(RequestUrl, `http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    expect(await hoppscotchRequestFlow.run(mem, {})).toEqual(checkpoint("HoppscotchRest"));
  } finally {
    server.close();
  }
});
