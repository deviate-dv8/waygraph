// Fixture: shared narration that restyles waygraph's own ring.
export const hideRing = (page: { addStyleTag(o: { content: string }): Promise<unknown> }) =>
  page.addStyleTag({ content: "#wg-ring { display: none !important; }" });
