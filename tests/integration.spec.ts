import { test, expect } from "@playwright/test";
import type { Checkpoint, Block } from "../src/types.js";
import { connect, checkpoint } from "../src/types.js";
import { runGraph } from "../src/engine.js";
import { MemPage, key } from "../src/mem-page.js";

// A tiny two-field form, self-contained as a data: URL - no fixture server needed.
// On submit it swaps in a "Submitted" heading, so a real assertion can confirm the
// real page actually reacted to the real click, not just that our code ran.
const FORM_HTML = `<!doctype html><html><body>
  <form id="f">
    <input placeholder="Email" name="email" />
    <input placeholder="Password" name="password" type="password" />
    <button type="submit">Submit</button>
  </form>
  <script>
    document.getElementById("f").addEventListener("submit", (e) => {
      e.preventDefault();
      document.body.innerHTML = "<h1>Submitted</h1>";
    });
  </script>
</body></html>`;
const FORM_URL = `data:text/html,${encodeURIComponent(FORM_HTML)}`;

type Start = Checkpoint<"__start__">;
type FormLoaded = Checkpoint<"FormLoaded">;
type FormFilled = Checkpoint<"FormFilled">;
type Submitted = Checkpoint<"Submitted">;

const EmailKey = key<string>("form.email");
const PasswordKey = key<string>("form.password");

const GotoForm: Block<Start, FormLoaded> = {
  name: "goto-form",
  instruction: {
    async act(page) {
      await page.goto(FORM_URL);
    },
    resolve: () => checkpoint("FormLoaded"),
  },
};

const FillForm: Block<FormLoaded, FormFilled> = {
  name: "fill-form",
  instruction: {
    async act(page, _input, mem) {
      await page.getByPlaceholder("Email").fill(mem.get(EmailKey));
      await page.getByPlaceholder("Password").fill(mem.get(PasswordKey));
    },
    resolve: () => checkpoint("FormFilled"),
  },
};

const SubmitForm: Block<FormFilled, Submitted> = {
  name: "submit-form",
  instruction: {
    async act(page) {
      await page.getByRole("button", { name: "Submit" }).click();
    },
    async observe(page) {
      // Proves the real click reached the real DOM: this waitFor throws (failing
      // the test) if the page never actually reacted to the click.
      await page.getByRole("heading", { name: "Submitted" }).waitFor();
    },
    resolve: () => checkpoint("Submitted"),
  },
};

test("a 3-Block chain drives a real page and runGraph returns the expected terminal Checkpoint", async ({
  context,
}) => {
  const mem = new MemPage();
  mem.set(EmailKey, "alice@test.com");
  mem.set(PasswordKey, "hunter2");

  const chain = connect(GotoForm, connect(FillForm, SubmitForm));

  const result = await runGraph<Submitted>(chain, new Set(["Submitted"]), context, mem);

  expect(result).toEqual(checkpoint("Submitted"));
});
