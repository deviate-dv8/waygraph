import type { Checkpoint } from "waygraph";

export type Home = Checkpoint<"Home">;
export type HomeVerified = Checkpoint<"HomeVerified">;
export type ItemInCart = Checkpoint<"ItemInCart">;
export type CartEmpty = Checkpoint<"CartEmpty">;
/** Anywhere an item can be added from: fresh on Home, or after the cart was emptied. */
export type CanAddItem = Home | CartEmpty;

// --- Mailpit (external tool surface, src/map/(external)/mailpit/) ---

/** Mailpit inbox UI reached; message list visible. */
export type MailpitInbox = Checkpoint<"MailpitInbox">;

/** The message addressed to the expected recipient is open; preview iframe visible. */
export type MailpitMessageOpen = Checkpoint<"MailpitMessageOpen">;

// --- Hoppscotch (external API client, src/map/(external)/hoppscotch/) ---

export type HoppscotchSettings = Checkpoint<"HoppscotchSettings">;
export type HoppscotchRest = Checkpoint<"HoppscotchRest">;

export type Docs = Checkpoint<"Docs">;
