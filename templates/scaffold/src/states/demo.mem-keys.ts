import { key, keyGroup } from "waygraph";

/**
 * Which catalog row `add-item` / `remove-item` act on.
 * `waygraph auto` fills this via Effect `instanceOptions` (one menu row per live button).
 */
export const SelectedItem = keyGroup<{ id: string; name: string }>("demo.selectedItem");

/** The link read out of the opened message - set by extract-email-link. */
export const EmailLink = keyGroup<{ url: string }>("demo.emailLink");

/**
 * The recipient open-message looks for in the inbox. Mailpit lists newest
 * first, but `.first()` alone picks the wrong row once more than one
 * recipient's mail is sitting in the same inbox - match by mem, not position.
 */
export const ExpectedRecipient = keyGroup<{ email: string }>("demo.expectedRecipient");

/**
 * Substring the link's `href` must contain - lets the same extract-email-link
 * Block serve any number of different email templates/scenarios in one
 * project without a new Block per scenario. Only the mem values change per
 * run, not the Blocks.
 */
export const ExpectedLinkPattern = key<string>("demo.expectedLinkPattern");

/**
 * The substring the open message's body must contain - same reuse reasoning
 * as ExpectedLinkPattern: one Block, many scenarios, driven by mem.
 */
export const ExpectedEmailContent = key<string>("demo.expectedEmailContent");
