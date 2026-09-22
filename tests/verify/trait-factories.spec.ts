import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../../src/index.js";
import {
  runGraph,
  MemPage,
  urlMatches,
  textEquals,
  visible,
  disabled,
  enabled,
  frameVisible,
  frameTextEquals,
  frameContainsText,
  checkpoint,
  Trait,
} from "../../src/index.js";

const FORM_URL = `data:text/html,${encodeURIComponent(
  `<!doctype html><html><body><h1 id="h">Hello</h1></body></html>`,
)}`;

const GATED_FORM_URL = `data:text/html,${encodeURIComponent(
  `<!doctype html><html><body>
    <button id="submit" disabled>Submit</button>
    <button id="cancel">Cancel</button>
  </body></html>`,
)}`;

const IFRAME_BODY = `<body>Please verify your account: <a href="https://app.example.com/verify?token=abc">Verify</a></body>`;
const IFRAME_URL = `data:text/html,${encodeURIComponent(
  `<!doctype html><html><body><iframe id="preview" srcdoc='${IFRAME_BODY}'></iframe></body></html>`,
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

test("disabled/enabled pass against a real gated button - the feature-state case, not just static content", async ({
  context,
}) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(GATED_FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [disabled("#submit"), enabled("#cancel")],
    },
  };

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});

test("disabled fails loud, naming itself, when the element is actually enabled", async ({ context }) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(GATED_FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [disabled("#cancel")],
    },
  };

  await expect(runGraph<Done>(block, undefined, context, new MemPage())).rejects.toThrow(
    /disabled\(#cancel\).*failed after "load"/,
  );
});

test("Trait.disabled/Trait.enabled are the same factories as disabled/enabled, just discoverable off Trait.", async ({
  context,
}) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(GATED_FORM_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [Trait.disabled("#submit"), Trait.enabled("#cancel")],
    },
  };

  expect(Trait.disabled).toBe(disabled);
  expect(Trait.enabled).toBe(enabled);

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

test("frameVisible/frameText/frameContains reach inside a real iframe, which plain visible/text cannot", async ({
  context,
}) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(IFRAME_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [
        Trait.frameVisible("#preview", "a"),
        Trait.frameContains("#preview", "body", "Please verify your account"),
        Trait.frameText("#preview", "a", "Verify"),
      ],
    },
  };

  expect(Trait.frameVisible).toBe(frameVisible);
  expect(Trait.frameText).toBe(frameTextEquals);
  expect(Trait.frameContains).toBe(frameContainsText);

  const result = await runGraph<Done>(block, undefined, context, new MemPage());
  expect(result).toEqual(checkpoint("Done"));
});

test("a plain page.locator (what visible/text use) cannot see content that only exists inside the iframe", async ({
  context,
}) => {
  const page = await context.newPage();
  await page.goto(IFRAME_URL);
  // The link only exists inside the iframe's own document - a plain top-level
  // locator (what Trait.visible/Trait.text use) never finds it, which is
  // exactly why frameVisible/frameText/frameContains exist as separate Traits.
  expect(await page.locator("a").count()).toBe(0);
  await page.close();
});

test("frameContains fails loud, naming itself, when the expected text is not in the frame", async ({ context }) => {
  const block: Block<Start, Done> = {
    name: "load",
    instruction: {
      async act(page) {
        await page.goto(IFRAME_URL);
      },
      resolve: () => checkpoint("Done"),
      verify: [Trait.frameContains("#preview", "body", "this text is not in the email")],
    },
  };

  await expect(runGraph<Done>(block, undefined, context, new MemPage())).rejects.toThrow(
    /frame-contains-text.*failed after "load"/,
  );
});
