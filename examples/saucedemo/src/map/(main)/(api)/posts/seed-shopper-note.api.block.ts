import { checkpoint, defineApiBlock, MemKey } from "waygraph";

/** The id the API gave the seeded record, kept for the steps after it. */
export const SeededId = new MemKey<number>("seeded.id");

/** Before the shopper arrives, the back office files a note for them: one POST, as a test's setup would. */
export const SeedShopperNote = defineApiBlock({
  name: "seed-shopper-note",
  description: "Files a note for the shopper through the API, before they shop.",
  method: "POST",
  from: checkpoint("InventoryPage"),
  to: checkpoint("InventoryPage"),
  call: async ({ request, mem }) => {
    const response = await request.post("https://jsonplaceholder.typicode.com/posts", {
      data: { title: "Welcome back, standard_user", body: "Free shipping on the first order.", userId: 1 },
    });
    mem.set(SeededId, ((await response.json()) as { id: number }).id);
    return response;
  },
});
