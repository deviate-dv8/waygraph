import { checkpoint, defineApiBlock } from "waygraph";

/** After the cart is filled: the shopper's notes are still there. */
export const CheckShopperNotes = defineApiBlock({
  name: "check-shopper-notes",
  description: "Asks the API for the shopper's notes: the seeded one's author still has them.",
  from: checkpoint("CartPage"),
  to: checkpoint("CartPage"),
  call: ({ request }) => request.get("https://jsonplaceholder.typicode.com/users/1/posts"),
});
