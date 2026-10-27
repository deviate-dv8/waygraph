// Fixture: a flow that paints its own caption instead of ctx.ui.caption.
export const handWrittenUiFlow = async (page: { evaluate(fn: () => void): Promise<void> }) => {
  await page.evaluate(() => {
    const bar = document.createElement("div");
    bar.textContent = "Signing in...";
    document.body.appendChild(bar);
  });
};
