# Mail adapters

## Mail adapters (cross-origin, browser-driven)

For flows driven by an email (signup confirmation, password reset, a magic link), the
convention is **not** a REST/HTTP client to the mail catcher - it's more Blocks, pointed at
the catcher's own web UI (MailHog, MailDev, Mailpit all ship one) as a real, separate,
cross-origin page. This needs zero new engine surface: a `NavBlock` navigates there like any
other page, `MethodBlock`s read the DOM with ordinary `page.locator`/`page.frameLocator`
calls, and a final `NavBlock` carries the extracted link back into the app under test.
Convergent, real-world evidence for this exact shape: independently, more than one real
consumer project settled on it rather than a REST client.

**Keep it in its own `*-external/<tool>/` folder, never mixed into your app's own Blocks** -
it's a different origin, driving a different site:

```typescript
// demo-external/mailpit/nav-mailpit-inbox.block.ts
export const NavMailpitInboxBlock = defineNavBlock({
  name: "nav-mailpit-inbox",
  checkpoint: MailpitInbox,
  url: () => process.env.WAYGRAPH_MAIL_URL ?? "http://127.0.0.1:8025",
  verify: [Trait.url({ pathname: "/" })],
});

// demo-external/mailpit/methods/open-message.method.block.ts
export const OpenMessageBlock = defineMethodBlock({
  name: "open-message",
  from: MailpitInbox,
  to: MailpitMessageOpen,
  requires: [ExpectedRecipient.key], // externally supplied - avoids picking the wrong inbox row
  instruction: {
    async act(page, _in, mem) {
      const { email } = mem.get(ExpectedRecipient.key);
      // Newest first; parallel runs sharing the inbox each open their own message.
      for (const row of await page.locator(MailpitSel.messageRow, { hasText: email }).all()) {
        if (!(await claimOnce(`mailpit:${await row.getAttribute("href")}`))) continue;
        await row.click();
        await page.waitForURL(/\/view\//);
        return;
      }
      throw new Error(`every message for "${email}" was already opened by another run`);
    },
  },
});

// claimOnce(name) is true for the first caller on this machine (any process, any worker) and false after, for
// 30 minutes (opts.ttlMs): parallel tests reading one shared inbox never open the same message.

// demo-external/mailpit/methods/extract-email-link.method.block.ts
// Named for what it does, not for one scenario - see "reusable across
// scenarios" below for why.
export const ExtractEmailLinkBlock = defineMethodBlock({
  name: "extract-email-link",
  from: MailpitMessageOpen,
  to: MailpitMessageOpen,
  requires: [ExpectedLinkPattern], // which link in the body to follow - externally supplied
  instruction: {
    async act(page, _in, mem) {
      const pattern = mem.get(ExpectedLinkPattern);
      const link = page.frameLocator(MailpitSel.previewIframe).locator(`a[href*="${pattern}"]`).first();
      const href = await link.getAttribute("href");
      if (!href) throw new Error(`no link matching "${pattern}" found`);
      mem.set(EmailLink({ url: href }));
    },
  },
});

// demo-web/nav-verification-link.block.ts - back into the app, no `requires` (see below)
export const NavVerificationLinkBlock = defineNavBlock({
  name: "nav-verification-link",
  checkpoint: HomeVerified,
  url: (mem) => mem.get(EmailLink.key).url,
  verify: [Trait.visible(DemoSel.verifiedBanner)],
});
```

Four atomic Blocks, each doing exactly one thing - `open-message` and `extract-email-link`
stay separate Methods for the same reason `fill-username`/`submit-login` do in the Sauce
Demo example: reading the link and navigating to it are two distinct actions, so they are
two distinct Blocks (`nav-verification-link` does the actual navigation).

Note `nav-verification-link` deliberately does **not** declare `requires: [EmailLink.key]` -
`requires` means "the caller must seed this externally before the flow starts" (preflight
checks a whole chain's requires up front), and this key is instead produced by
`extract-email-link` earlier in the very same chain. Declaring it as a requirement would make
preflight reject the run before it ever gets a chance to produce it - `requires` is only for
keys a caller truly must supply from outside the chain (like `ExpectedRecipient` above).

Live reference, proven end to end against a real, throwaway Mailpit container:
`templates/scaffold/src/map/(external)/mailpit/` + `src/flows/mail-verify.flow.ts` +
`tests/mail-verify.spec.ts`.

### Reusable across scenarios: mem-driven, not one Block per email

The natural instinct once you have a signup-verification flow is to want a matching set of
Blocks for password reset, then another for a magic link, and so on - N scenarios, N Block
sets. That's the wrong axis to scale on. `open-message`, `extract-email-link`, and the two
assert Blocks below are already scenario-agnostic: **only mem varies per run, never the
Blocks**:

| Mem key | Answers |
|---|---|
| `ExpectedRecipient` | Which inbox row to open |
| `ExpectedLinkPattern` | Which link in the body to follow (a real email often has more than one - "report abuse" and the real link both present) |
| `ExpectedEmailContent` | What the body is supposed to say |

The same four Blocks (`assert-email-received`, `open-message`, `assert-email-content`,
`extract-email-link`) run a signup-verification check and a password-reset check identically
- just with different mem, in `templates/scaffold/tests/mail-verify.spec.ts`:

```typescript
mem.set(ExpectedRecipient({ email: "demo-user@example.com" }));
mem.set(ExpectedLinkPattern, "verified=1");
mem.set(ExpectedEmailContent, "Please confirm your email address...");
await mailVerifyFlow.run(context, mem); // signup verification

mem.set(ExpectedRecipient({ email: "password-reset-user@example.com" }));
mem.set(ExpectedLinkPattern, "verified=1"); // picks the real link, not the "report abuse" decoy also in the body
mem.set(ExpectedEmailContent, "We received a request to reset your password.");
await mailVerifyFlow.run(context, mem); // same flow, same Blocks, different email entirely
```

Naming matters here: a Block named `extract-verification-link` would wrongly imply it only
ever handles verification emails - once a Block's behavior is mem-driven, its name should
describe the mechanism (`extract-email-link`), not one scenario that happens to use it.

A **mail-provider page hub** ties it together, the same `definePageBlock` pattern used
everywhere else - one page, several reusable methods, each pulling its specifics from mem:

```typescript
export const MailpitInboxPageBlock = definePageBlock({
  name: "page-mailpit-inbox",
  checkpoint: MailpitInbox,
  verify: [Trait.url({ pathname: "/" })],
  methods: {
    assertEmailReceived: () => AssertEmailReceivedBlock,
    openMessage: () => OpenMessageBlock,
    assertEmailContent: () => AssertEmailContentBlock,
    extractEmailLink: () => ExtractEmailLinkBlock,
  },
});
```

### QA-rich: does the email exist, and does it say the right thing

Two more assert Blocks slot into the same chain, both mem-driven, both proven to fail loud
(not silently pass) on a real negative case - no email arrived, and an email arrived with
the wrong copy:

```typescript
// "Did the email even arrive" - doesn't open/consume it, safe to check before deciding to.
// A mem-aware Trait: the selector depends on the expected recipient, so it
// can't be a static Trait.visible(...) string - check(page, mem) already gets mem.
const emailReceived: Trait = {
  name: "email-received",
  async check(page, mem) {
    const { email } = mem.get(ExpectedRecipient.key);
    try {
      await page.locator(MailpitSel.messageRow, { hasText: email }).first().waitFor({
        state: "visible",
        timeout: 10_000,
      });
      return true;
    } catch {
      return false;
    }
  },
};
export const AssertEmailReceivedBlock = defineAssertBlock({
  name: "assert-email-received",
  checkpoint: MailpitInbox,
  requires: [ExpectedRecipient.key],
  verify: [emailReceived],
});

// "Does the email say what it's supposed to" - reads the body content, not
// just whether a link exists. The expected text comes from mem too (same
// reuse reasoning as above) via another bespoke mem-aware Trait, since
// Trait.frameContains's own factory bakes its expected string in at
// Block-definition time, not runtime.
const bodyContainsExpectedText: Trait = {
  name: "body-contains-expected-text",
  async check(page, mem) {
    const expected = mem.get(ExpectedEmailContent);
    const text = await page.frameLocator(MailpitSel.previewIframe).locator("body").textContent();
    return (text ?? "").includes(expected);
  },
};
export const AssertEmailContentBlock = defineAssertBlock({
  name: "assert-email-content",
  checkpoint: MailpitMessageOpen,
  requires: [ExpectedEmailContent],
  verify: [bodyContainsExpectedText],
});
```

`Trait.frameVisible(frameSelector, innerSelector)` / `Trait.frameText(frameSelector,
innerSelector, expected)` (exact match) / `Trait.frameContains(frameSelector, innerSelector,
expected)` (substring match, for a *fixed* known expected string) mirror
`Trait.visible`/`Trait.text` exactly, scoped to a frame - reusable for any iframe content,
not just mail; reach for a bespoke mem-aware Trait instead when the expected value itself
needs to vary per run, as both examples above do. Wired into the chain right where they
belong:

```typescript
engine
  .map()
  .start()
  .gotoExternal(NavMailpitInboxBlock)
  .assert(AssertEmailReceivedBlock)
  .method(OpenMessageBlock)
  .assert(AssertEmailContentBlock)
  .method(ExtractEmailLinkBlock)
  .gotoPage(NavVerificationLinkBlock)
  .end()
```

### Where this shows up in `waygraph auto`

A `NavBlock` has wildcard `In` (`from: "*"` in the static graph) unless it declares `from`, so it's reasonable to
wonder whether `nav-mailpit-inbox` clutters the live picker on every single screen. It
doesn't - `waygraph auto`'s menu builder already special-cases exactly this
(`src/live/auto-explore.ts`, `buildExploreMenu`): a URL-based Nav is excluded from the interactive
menu once you're on a known screen, offered only as a "Start here" bootstrap option. The
static graph still keeps the `from: "*"` edge for `waygraph graph`/`findBlockPath`/`traverse`,
so `waygraph auto --blocks "<AppCheckpoint> MailpitInbox"` can still route there deliberately -
it's just never suggested unprompted. The tested, recommended way to actually use this is an
authored flow/chain (`someAppFlow then mailVerifyFlow`), exactly like `mailVerifyFlow` itself.
