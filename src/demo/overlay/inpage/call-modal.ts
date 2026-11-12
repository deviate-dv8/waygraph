// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// The call modal: one HTTP call opened from the outcome card: what was asked (method, address, headers, body), what came
// back (status in words, why, headers, body), and a "copy as cURL". `window.__wgOpenCall(call)` opens it; the card's rows call it.
import type { IconName } from "../ui/icons.js";

/** One call as the card and the modal show it (bodies already text, long ones cut). */
export interface CallView {
  name: string;
  method: string;
  url: string;
  /** `201 Created`. */
  words: string;
  status: number;
  /** What the status means for this call, in a sentence. */
  why: string;
  ms: number;
  size?: number;
  failed: boolean;
  /** `api`: an API Block made it; `page`: the page did. */
  source: "page" | "api";
  cacheable?: boolean;
  reqHeaders: Record<string, string>;
  reqBody?: string;
  resHeaders: Record<string, string>;
  resBody?: string;
  curl: string;
}

export function installCallModal() {
  if (typeof __wgEl !== "function" || typeof __wgAdd !== "function") return;
  const bytes = (n: number) => (n < 1024 ? n + " B" : n < 1024 * 1024 ? (n / 1024).toFixed(1) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB");

  const headersTable = (headers: Record<string, string>) => {
    const keys = Object.keys(headers);
    if (!keys.length) return __wgEl("div", { class: "text-2xs text-label-3" }, "None");
    return __wgEl(
      "table",
      { class: "w-full text-2xs" },
      keys.map((k) => __wgEl("tr", null, __wgEl("td", { class: "w-36 pr-2 align-top whitespace-nowrap text-label-2" }, k), __wgEl("td", { class: "align-top break-all" }, String(headers[k])))),
    );
  };

  const body = (text: string | undefined) =>
    text === undefined || text === ""
      ? __wgEl("div", { class: "text-2xs text-label-3" }, "Empty")
      : __wgEl("pre", { class: "max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-control bg-fill p-2 font-mono text-2xs" }, text);

  const panel = (icon: IconName, title: string, ...content: WgChild[]) =>
    __wgEl(
      "section",
      { class: "flex min-w-0 flex-1 flex-col gap-2" },
      __wgEl("h3", { class: "flex items-center gap-1.5 text-xs font-semibold text-label-2" }, __wgIcon(icon), title),
      ...content,
    );

  const sub = (title: string, ...content: WgChild[]) =>
    __wgEl("div", { class: "flex flex-col gap-1" }, __wgEl("h4", { class: "text-2xs font-semibold text-label-3" }, title), ...content);

  window.__wgOpenCall = (call: CallView) => {
    __wgById("wg-call-modal")?.remove();
    const close = () => {
      document.removeEventListener("keydown", onKey, true);
      el.remove();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    const closeBtn = __wgEl("button", { class: "button-plain ml-auto", attrs: { type: "button", "aria-label": "Close" } }, __wgIcon("close"));
    closeBtn.addEventListener("click", close);
    const copyLabel = __wgEl("span", {}, "Copy as cURL");
    const copy = __wgEl("button", { class: "button self-start h-[22px] font-sans text-xs", attrs: { type: "button" } }, __wgIcon("copy"), copyLabel);
    copy.addEventListener("click", () => {
      navigator.clipboard?.writeText(call.curl).catch(() => {});
      copyLabel.textContent = "Copied";
      setTimeout(() => (copyLabel.textContent = "Copy as cURL"), 1200);
    });
    const facts = [call.source === "api" ? "made by the flow" : "made by the page", call.ms + " ms", call.size !== undefined ? bytes(call.size) : "", call.cacheable ? "cacheable" : ""].filter(Boolean).join("  ·  ");
    const el = __wgEl(
      "div",
      { id: "wg-call-modal", class: "wg-call-backdrop", attrs: { "data-wg-ui": "1" } },
      __wgEl(
        "div",
        { class: "wg-call-card material-thick rounded-panel flex max-h-[86vh] w-[min(94vw,880px)] flex-col gap-3 overflow-hidden p-4 text-xs" },
        __wgEl(
          "header",
          { class: "flex flex-wrap items-center gap-2" },
          __wgEl("span", { class: "font-mono text-sm font-semibold" }, call.name),
          __wgEl("span", { class: "capsule h-[20px] px-2 text-2xs font-semibold " + (call.failed ? "bg-red text-white" : "bg-green text-white") }, call.words),
          closeBtn,
        ),
        __wgEl("div", { class: "text-label-2" }, call.why),
        __wgEl("div", { class: "text-2xs text-label-3" }, facts),
        __wgEl(
          "div",
          { class: "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto sm:flex-row" },
          panel("next", "Request", __wgEl("div", { class: "break-all font-mono text-2xs" }, call.method + " " + call.url), sub("Headers", headersTable(call.reqHeaders)), sub("Body", body(call.reqBody))),
          panel("info", "Response", sub("Headers", headersTable(call.resHeaders)), sub("Body", body(call.resBody))),
        ),
        copy,
      ),
    );
    el.addEventListener("click", (ev) => {
      if (ev.target === el) close();
    });
    document.addEventListener("keydown", onKey, true);
    __wgAdd(el);
    requestAnimationFrame(() => el.classList.add("wg-in"));
  };
}
