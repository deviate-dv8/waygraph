// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// A step's outcome card, after it: what the scenario expected (ticked in turn) and what the page now shows that changed.
// In the bottom-centre slot, above the step panel, so it shows whether the panel is open or not.
import type { IconName } from "../ui/icons.js";

/** What the card shows: the step's expectations (pending until ticked) and the read values that changed. */
export interface OutcomeCard {
  expects: { text: string; ok: boolean; saw?: string }[];
  changes: { key: string; from: string; to: string }[];
  /** Changes left out to keep the card short. */
  moreChanges: number;
  /** What a layout handled while the step ran (a cookie banner closed). */
  interrupts: string[];
}

export function showOutcome(card: OutcomeCard) {
  const section = (icon: IconName, title: string, ...rows: WgChild[]) =>
    __wgEl(
      "section",
      { class: "wg-outcome-section" },
      __wgEl("div", { class: "flex items-center gap-1.5 text-xs font-semibold text-label-2 mb-1" }, __wgIcon(icon), title),
      ...rows,
    );
  const expects = card.expects.length
    ? section(
        "checklist",
        "Expected",
        __wgEl(
          "ul",
          { class: "flex flex-col gap-1" },
          card.expects.map((e, i) =>
            __wgEl(
              "li",
              { class: "wg-outcome-row flex items-start gap-1.5 text-sm", data: { state: "pending", ok: e.ok ? "1" : "0", index: i } },
              __wgEl("span", { class: "wg-outcome-mark shrink-0" }, __wgIcon("pending", "text-label-3")),
              __wgEl(
                "span",
                { class: "min-w-0" },
                e.text,
                e.ok || !e.saw ? null : __wgEl("span", { class: "wg-outcome-saw block text-xs text-red" }, "saw " + e.saw),
              ),
            ),
          ),
        ),
      )
    : null;
  const changes = card.changes.length
    ? section(
        "info",
        "Now shows",
        __wgEl(
          "dl",
          { class: "grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs" },
          card.changes.map((c) => [
            __wgEl("dt", { class: "font-mono text-label-2" }, c.key),
            __wgEl(
              "dd",
              { class: "flex min-w-0 items-center gap-1", title: c.from + " to " + c.to },
              __wgEl("span", { class: "truncate text-label-2" }, c.from),
              __wgIcon("chevronRight", "text-label-3"),
              __wgEl("span", { class: "truncate font-semibold" }, c.to),
            ),
          ]),
        ),
        card.moreChanges > 0 ? __wgEl("div", { class: "text-2xs text-label-2 mt-0.5" }, "+" + card.moreChanges + " more in the step panel") : null,
      )
    : null;
  const handled = card.interrupts.length
    ? section("info", "Handled on the way", __wgEl("ul", { class: "flex flex-col gap-0.5 text-xs" }, card.interrupts.map((i) => __wgEl("li", {}, i))))
    : null;
  const had = __wgById("wg-outcome");
  if (!expects && !changes && !handled) {
    had?.remove();
    return;
  }
  // The card already up (a step before on this screen) gets the new rows in place: it stays, it doesn't slide in again.
  if (had) {
    __wgSet(had, expects, changes, handled);
    had.classList.add("wg-in");
    return;
  }
  const el = __wgEl(
    "div",
    { id: "wg-outcome", class: "material rounded-panel px-3 py-2 flex flex-col gap-2 max-w-[min(440px,92vw)]", attrs: { "data-wg-ui": "1" } },
    expects,
    changes,
    handled,
  );
  __wgAdd(el);
  requestAnimationFrame(() => el.classList.add("wg-in"));
}

/** Marks expectation `index` as checked: a tick when it held, a cross when it didn't. */
export function tickOutcome(index: number) {
  const row = __wgById("wg-outcome")?.querySelector<HTMLElement>(`.wg-outcome-row[data-index="${index}"]`);
  if (!row) return;
  const ok = row.dataset.ok === "1";
  row.dataset.state = ok ? "ok" : "fail";
  const mark = row.querySelector(".wg-outcome-mark");
  if (mark) __wgSet(mark, __wgIcon(ok ? "done" : "error", ok ? "text-green" : "text-red"));
}

/** Takes the card away; on a page the overlay isn't on yet (the first step), there's nothing to take. */
export function hideOutcome() {
  if (typeof __wgById !== "function") return;
  __wgById("wg-outcome")?.remove();
}
