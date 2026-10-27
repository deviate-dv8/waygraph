// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// The narration caption: a subtitle card in the bottom-centre slot (ctx.ui.caption).
export function showCaption(text: string) {
  let bar = __wgById("wg-caption-bar");
  if (!bar) {
    bar = __wgEl(
      "div",
      { id: "wg-caption-bar", class: "flex justify-center max-w-[min(820px,92vw)] pointer-events-none", attrs: { "data-wg-ui": "1" } },
      __wgEl("span", { class: "wg-caption-text material rounded-panel px-4 py-2 text-lg font-medium text-center text-balance" }),
    );
    __wgAdd(bar);
  }
  const span = bar.querySelector<HTMLElement>(".wg-caption-text");
  if (span) span.textContent = text;
  bar.classList.add("wg-in");
}

export function hideCaption() {
  const bar = __wgById("wg-caption-bar");
  if (bar) bar.classList.remove("wg-in");
}
