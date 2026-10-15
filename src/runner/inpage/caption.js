// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// Bottom narration caption - a white rounded card, not the dark zsign-ported scrim this started as
// (see ui/css/caption.css's own header); narration-timeline/TTS sync not ported yet.
export function showCaption(text) {
  let bar = __wgById("wg-caption-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "wg-caption-bar";
    bar.setAttribute("data-wg-ui", "1");
    const span = document.createElement("span");
    span.className = "wg-caption-text";
    bar.appendChild(span);
    __wgAdd(bar);
  }
  const span = bar.querySelector(".wg-caption-text");
  span.textContent = text;
  bar.classList.add("wg-in");
}

export function hideCaption() {
  const bar = __wgById("wg-caption-bar");
  if (bar) bar.classList.remove("wg-in");
}
