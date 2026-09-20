import type { Checkpoint } from "waygraph";

export type Home = Checkpoint<"Home">;
export type HomeVerified = Checkpoint<"HomeVerified">;
export type ItemInCart = Checkpoint<"ItemInCart">;
export type CartEmpty = Checkpoint<"CartEmpty">;

// --- Mailpit (external tool surface, demo-external lane) ---

/** Mailpit inbox UI reached; message list visible. */
export type MailpitInbox = Checkpoint<"MailpitInbox">;

/** The message addressed to the expected recipient is open; preview iframe visible. */
export type MailpitMessageOpen = Checkpoint<"MailpitMessageOpen">;

// --- Waygraph Map convention demo (src/routes/, alongside src/blocks/'s manual mode) ---

/** Reached via src/routes/(external)/docs/ - see openspec/changes/waygraph-map. */
export type Docs = Checkpoint<"Docs">;
