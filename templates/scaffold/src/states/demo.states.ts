import { checkpoint } from "waygraph";

export const Home = checkpoint("Home");
export type Home = typeof Home;
export const HomeVerified = checkpoint("HomeVerified");
export type HomeVerified = typeof HomeVerified;
export const ItemInCart = checkpoint("ItemInCart");
export type ItemInCart = typeof ItemInCart;
export const CartEmpty = checkpoint("CartEmpty");
export type CartEmpty = typeof CartEmpty;
/** Anywhere an item can be added from: fresh on Home, or after the cart was emptied. */
export const CanAddItem = [Home, CartEmpty] as const;
export type CanAddItem = (typeof CanAddItem)[number];

// --- Mailpit (external tool surface, src/map/(external)/mailpit/) ---

/** Mailpit inbox UI reached; message list visible. */
export const MailpitInbox = checkpoint("MailpitInbox");
export type MailpitInbox = typeof MailpitInbox;

/** The message addressed to the expected recipient is open; preview iframe visible. */
export const MailpitMessageOpen = checkpoint("MailpitMessageOpen");
export type MailpitMessageOpen = typeof MailpitMessageOpen;

// --- Hoppscotch (external API client, src/map/(external)/hoppscotch/) ---

export const HoppscotchSettings = checkpoint("HoppscotchSettings");
export type HoppscotchSettings = typeof HoppscotchSettings;
export const HoppscotchRest = checkpoint("HoppscotchRest");
export type HoppscotchRest = typeof HoppscotchRest;

export const Docs = checkpoint("Docs");
export type Docs = typeof Docs;
