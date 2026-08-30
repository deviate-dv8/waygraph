import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/index.js";
import { runGraph, MemPage, urlMatches, textEquals, visible, checkpoint, Trait } from "../src/index.js";

const FORM_URL = `data:text/html,${encodeURIComponent(
  `<!doctype html><html><body><h1 id="h">Hello</h1></body></html>`,
)}`;

type Start = Checkpoint<"__start__">;
type Done = Checkpoint<"Done">;

test("urlMatches, textEquals, and visible all pass against a real page", async ({ context }) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [urlMatches({ protocol: "data" }), textEquals("#h", "Hello"), visible("#h")],
    },
  };

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});

test("textEquals fails loud, naming itself, when the text doesn't match", async ({ context }) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [textEquals("#h", "Goodbye")],
    },
  };

  await expect(runGraph<Done>(block, undefined, context, new MemPage())).rejects.toThrow(
    /text-equals/,
  );
});

test("Trait.url matches on pathname alone, ignoring a hybrid SPA's own query params - unspecified components mean 'don't care', not 'must be empty'", async ({
  context,
}) => {
  await context.route("https://waygraph.test/**", (route) =>
    route.fulfill({ body: "<!doctype html><html><body>ok</body></html>", contentType: "text/html" }),
  );

  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        // This is exactly what would break a full-href regex match - a hybrid
        // SPA tacking ?ref=email&session=abc123 onto the URL shouldn't matter,
        // since the actual route reached is still /inventory.html.
        await page.goto("https://waygraph.test/inventory.html?ref=email&session=abc123");
      },
      resolve: () => checkpoint("Done"),
      // No `search` field given - the pattern only constrains pathname, so
      // whatever query string the SPA appended is irrelevant here.
      verify: [Trait.url({ pathname: "/inventory.html" })],
    },
  };

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});

test("Trait.url can also be pinned to an exact query string when that precision is actually wanted", async ({
  context,
}) => {
  await context.route("https://waygraph.test/**", (route) =>
    route.fulfill({ body: "<!doctype html><html><body>ok</body></html>", contentType: "text/html" }),
  );

  const trait = Trait.url({ pathname: "/inventory.html", search: "ref=email" });
  expect(trait.name).toContain("ref=email");

  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto("https://waygraph.test/inventory.html?ref=email");
      },
      resolve: () => checkpoint("Done"),
      verify: [trait],
    },
  };

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});

test("Trait.url/Trait.text/Trait.visible are the same factories as urlMatches/textEquals/visible, just discoverable off Trait.", async ({
  context,
}) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [Trait.url({ protocol: "data" }), Trait.text("#h", "Hello"), Trait.visible("#h")],
    },
  };

  expect(Trait.url).toBe(urlMatches);
  expect(Trait.text).toBe(textEquals);
  expect(Trait.visible).toBe(visible);

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});
