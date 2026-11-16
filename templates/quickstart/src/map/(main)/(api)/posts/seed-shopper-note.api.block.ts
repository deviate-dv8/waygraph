import { checkpoint, defineApiBlock, MemKey } from "waygraph";

/** The id the API gave the seeded record, kept for the steps after it. */
export const SeededId = new MemKey<number>("seeded.id");

/** Before the shopper arrives, the back office files a note for them: one POST, as a test's setup would. It is a precondition (`given`) of the flows that need it, and `undo` takes it back afterwards. */
export const SeedShopperNote = defineApiBlock({
  name: "seed-shopper-note",
  description: "Files a note for the shopper through the API, before they shop.",
  method: "POST",
  to: checkpoint("NoteFiled"),
  call: async ({ request, mem }) => {
    const response = await request.post("https://jsonplaceholder.typicode.com/posts", {
      data: { title: "Welcome back, standard_user", body: "Free shipping on the first order.", userId: 1 },
    });
    mem.set(SeededId, ((await response.json()) as { id: number }).id);
    return response;
  },
  undo: ({ request, mem }) => request.delete(`https://jsonplaceholder.typicode.com/posts/${mem.get(SeededId)}`),
});
