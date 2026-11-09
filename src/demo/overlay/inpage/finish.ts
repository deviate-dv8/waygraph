// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// The demo's last word: once its steps end, a card over a veil says it's done and how it went, so a viewer (or a
// recording) isn't left looking at the app with nothing to say the flow is over.

/** How the demo ended, as the card says it. */
export interface FinishCard {
  status: "passed" | "expected" | "stopped";
  title: string;
  /** "13 steps · 4.1 s". */
  summary: string;
  /** Why it stopped, or the failure the flow expects. */
  detail?: string;
}

export function showFinish(card: FinishCard) {
  __wgById("wg-finish")?.remove();
  const icon = card.status === "stopped" ? __wgIcon("error", "text-red") : __wgIcon("done", "text-green");
  const heading = card.status === "passed" ? "Finished" : card.status === "expected" ? "Finished as expected" : "Stopped";
  const el = __wgEl(
    "div",
    { id: "wg-finish", attrs: { "data-wg-ui": "1", "data-wg-modal": "finish", "data-wg-ready": "1", role: "status" } },
    __wgEl(
      "div",
      { class: "wg-finish-card material-thick rounded-panel px-8 py-6 flex flex-col items-center gap-2 text-center max-w-[min(520px,90vw)]" },
      __wgEl("span", { class: "wg-finish-icon" }, icon),
      __wgEl("div", { class: "text-2xl font-semibold tracking-tight" }, heading),
      __wgEl("div", { class: "text-base text-label-2" }, card.title),
      __wgEl("div", { class: "text-sm text-label-2" }, card.summary),
      card.detail ? __wgEl("div", { class: "wg-finish-detail mt-1 text-sm text-label-2 line-clamp-3" }, card.detail) : null,
    ),
  );
  __wgAdd(el);
  requestAnimationFrame(() => el.classList.add("wg-in"));
}
