import { defineGivenBlock, MemKey } from "waygraph";

/** The id the seed gave the record, kept for the steps after it. */
export const SeededId = new MemKey<number>("seeded.id");

const NOTES = "https://jsonplaceholder.typicode.com/posts";

/** Before the shopper arrives, the back office has filed a note for them. Here it is one request; in a real project, a factory or a seed script. */
export const SeedShopperNote = defineGivenBlock({
  name: "seed-shopper-note",
  description: "A note is waiting for the shopper before they shop.",
  sets: [SeededId],
  run: async (mem) => {
    const response = await fetch(NOTES, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Welcome back, standard_user", body: "Free shipping on the first order.", userId: 1 }),
    });
    mem.set(SeededId, ((await response.json()) as { id: number }).id);
  },
  undo: async (mem) => void (await fetch(`${NOTES}/${mem.get(SeededId)}`, { method: "DELETE" })),
});
