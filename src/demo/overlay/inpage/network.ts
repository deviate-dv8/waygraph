// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure
// (page.evaluate serializes ONLY the passed function's own source, not sibling top-level
// functions in this file - every helper below is nested inside addNetworkEntry itself for exactly
// that reason; a row's click handler still works after addNetworkEntry returns because it's a
// closure over ITS OWN invocation's nested helpers, not a reference to module scope).
//
// A real network-tab overlay (`#wg-network-log`): the DevTools Network panel itself can't be
// embedded (it lives in browser chrome, not reachable from automation), but every entry's real
// data is - this renders that, on-page: method, url, status, and (click a row) request/response
// headers + bodies + a "copy as cURL" command, a Postman-style inspector for both real page
// traffic (installNetworkCapture, network-capture.js) and defineApiBlock's own page.request calls.
import type { NetworkEntry } from "../../types.js";
export function addNetworkEntry(entry: NetworkEntry) {
  // No-op outside a demo/pilot/auto run - ensureShadowRoot() (and its __wgById/__wgAdd globals)
  // is never installed for a plain `waygraph run`/Playwright test, and this must not throw there.
  if (typeof __wgById !== "function" || typeof __wgAdd !== "function" || typeof __wgEl !== "function") return;

  function methodClass(method: string | undefined) {
    const m = (method || "GET").toUpperCase();
    if (m === "GET") return "get";
    if (m === "POST") return "post";
    if (m === "PUT" || m === "PATCH") return "put";
    if (m === "DELETE") return "delete";
    return "other";
  }
  const METHOD_COLOR: Record<string, string> = { get: "text-blue", post: "text-green", put: "text-orange", delete: "text-red", other: "text-gray" };

  function toCurl(e: NetworkEntry) {
    let cmd = "curl -X " + (e.method || "GET") + " '" + String(e.url || "").replace(/'/g, "'\\''") + "'";
    const headers = e.reqHeaders || {};
    for (const k of Object.keys(headers)) {
      if (/^:/.test(k)) continue; // HTTP/2 pseudo-headers - not valid curl -H input
      cmd += " \\\n  -H '" + k + ": " + String(headers[k]).replace(/'/g, "'\\''") + "'";
    }
    if (e.reqBody) cmd += " \\\n  --data '" + String(e.reqBody).replace(/'/g, "'\\''") + "'";
    return cmd;
  }

  function renderHeaders(headers: Record<string, string> | undefined) {
    const h = headers || {};
    const keys = Object.keys(h);
    if (keys.length === 0) return __wgEl("div", { class: "wg-net-empty text-label-3" }, "None");
    return __wgEl(
      "table",
      { class: "wg-net-headers w-full text-2xs" },
      keys.map((k) =>
        __wgEl("tr", null, __wgEl("td", { class: "pr-2 align-top whitespace-nowrap text-label-2" }, k), __wgEl("td", { class: "align-top break-all" }, String(h[k]))),
      ),
    );
  }

  function renderBody(body: string | undefined) {
    if (body === undefined || body === null || body === "") return __wgEl("div", { class: "wg-net-empty text-label-3" }, "Empty");
    let text = body;
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* not JSON - show raw */
    }
    return __wgEl("pre", { class: "wg-net-body max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-2xs" }, String(text).slice(0, 4000));
  }

  function section(heading: string, ...content: WgChild[]) {
    return __wgEl(
      "div",
      { class: "wg-net-detail-section flex flex-col gap-1" },
      __wgEl("h4", { class: "font-sans text-2xs font-semibold text-label-2" }, heading),
      ...content,
    );
  }

  function renderDetail(e: NetworkEntry): WgChild[] {
    return [
      section("Request headers", renderHeaders(e.reqHeaders)),
      e.reqBody ? section("Request body", renderBody(e.reqBody)) : null,
      section("Response headers", renderHeaders(e.resHeaders)),
      section("Response body", renderBody(e.resBody)),
      section(
        "cURL",
        __wgEl("pre", { class: "wg-net-body wg-net-curl max-h-40 overflow-y-auto whitespace-pre-wrap break-all text-2xs" }, toCurl(e)),
        __wgEl(
          "button",
          { class: "wg-net-copy button self-start h-[22px] font-sans text-xs", data: { copy: "1" }, attrs: { type: "button" } },
          __wgIcon("copy"),
          __wgEl("span", { class: "wg-net-copy-label" }, "Copy as cURL"),
        ),
      ),
    ];
  }

  let panel = __wgById("wg-network-log");
  if (!panel) {
    const toggle = __wgEl("button", { class: "wg-net-collapse button-plain", attrs: { type: "button", "aria-label": "Collapse" } }, __wgIcon("chevronDown"));
    toggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      panel!.classList.toggle("wg-net-collapsed");
      __wgSet(toggle, __wgIcon(panel!.classList.contains("wg-net-collapsed") ? "chevronUp" : "chevronDown"));
    });
    panel = __wgEl(
      "div",
      {
        id: "wg-network-log",
        class: "material-thick rounded-panel flex flex-col w-[min(92vw,400px)] max-h-[min(60vh,420px)] overflow-hidden text-xs",
        attrs: { "data-wg-ui": "1" },
      },
      __wgEl(
        "div",
        { class: "wg-net-header flex flex-none items-center gap-2 h-8 pl-3 pr-1.5 border-b-[0.5px] border-separator" },
        __wgIcon("network", "text-label-2"),
        __wgEl("span", { class: "wg-net-title flex-1 text-sm font-semibold" }, "Network"),
        __wgEl("span", { class: "wg-net-count capsule h-[18px] px-1.5 bg-fill text-2xs font-semibold text-label-2 tabular-nums" }, "0"),
        toggle,
      ),
      __wgEl("ol", { class: "wg-net-list flex flex-col p-1 overflow-y-auto font-mono" }),
    );
    __wgAdd(panel);
  }

  const w = window;
  w.__wgNetworkEntries = w.__wgNetworkEntries || [];
  w.__wgNetworkEntries.push(entry);
  while (w.__wgNetworkEntries.length > 30) w.__wgNetworkEntries.shift();

  const list = panel.querySelector<HTMLElement>(".wg-net-list");
  if (!list) return;
  const row = __wgEl("li", { class: "wg-net-row flex items-baseline gap-2 px-2 py-[3px] rounded-control cursor-default hover:bg-fill" });
  row.dataset.ok = entry.ok ? "1" : "0";
  let path = entry.url;
  try {
    const u = new URL(String(entry.url));
    path = u.pathname + u.search;
  } catch {
    /* not an absolute URL - show as given */
  }
  __wgSet(
    row,
    __wgEl(
      "span",
      { class: "wg-net-method wg-net-method-" + methodClass(entry.method) + " w-11 flex-none text-2xs font-semibold " + METHOD_COLOR[methodClass(entry.method)] },
      (entry.method || "GET").toUpperCase(),
    ),
    __wgEl("span", { class: "wg-net-path flex-1 min-w-0 truncate", title: String(entry.url) }, path),
    __wgEl("span", { class: "wg-net-status flex-none font-semibold " + (entry.ok ? "text-green" : "text-red") }, String(entry.status ?? "")),
    entry.ms !== undefined ? __wgEl("span", { class: "wg-net-ms flex-none text-2xs text-label-3 tabular-nums" }, entry.ms + "ms") : null,
  );
  row.addEventListener("click", () => {
    const open = row.classList.contains("wg-net-open");
    __wgQA(".wg-net-row.wg-net-open").forEach((r) => {
      r.classList.remove("wg-net-open");
      const d = r.nextElementSibling;
      if (d && d.classList && d.classList.contains("wg-net-detail")) d.remove();
    });
    if (open) return;
    row.classList.add("wg-net-open");
    const detail = __wgEl("li", { class: "wg-net-detail flex flex-col gap-2 m-1 p-2 rounded-card bg-fill" });
    __wgSet(detail, renderDetail(entry));
    const copyBtn = detail.querySelector<HTMLElement>("[data-copy]");
    if (copyBtn) {
      copyBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const text = toCurl(entry);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        const label = copyBtn.querySelector(".wg-net-copy-label");
        if (label) label.textContent = "Copied";
        setTimeout(() => {
          if (label) label.textContent = "Copy as cURL";
        }, 1200);
      });
    }
    row.after(detail);
  });
  list.appendChild(row);
  while (list.children.length > 30 && list.firstChild) list.removeChild(list.firstChild);
  const countEl = panel.querySelector<HTMLElement>(".wg-net-count");
  if (countEl) countEl.textContent = String(w.__wgNetworkEntries.length);
  // Always captured, only shown when explicitly turned on (ctx.ui.showNetworkTab(); default hidden -
  // see StubCtx's own doc comment) - the DOM/row still gets built either way, so toggling visible
  // later shows the full history immediately, not just entries captured after that point.
  if (w.__wgNetworkTabVisible) {
    panel.classList.remove("wg-out");
    void panel.offsetWidth;
    panel.classList.add("wg-in");
    void row.offsetWidth;
    row.classList.add("wg-in");
  }
}

/**
 * Shows or hides the network-tab panel - capture keeps happening either way (addNetworkEntry
 * always builds the DOM row; this only toggles whether the panel itself is visible). Safe to call
 * before any entry exists yet - it just remembers the flag for addNetworkEntry to check later.
 */
export function setNetworkTabVisible(visible: boolean) {
  if (typeof __wgById !== "function") return;
  window.__wgNetworkTabVisible = !!visible;
  const panel = __wgById("wg-network-log");
  if (!panel) return;
  if (visible) {
    panel.classList.remove("wg-out");
    panel.classList.add("wg-in");
    __wgQA(".wg-net-row").forEach((r) => r.classList.add("wg-in"));
  } else {
    panel.classList.remove("wg-in");
    panel.classList.add("wg-out");
  }
}

/** Clears every captured entry and removes the panel - a fresh navigation/session starting over. */
export function clearNetworkLog() {
  if (typeof __wgById !== "function") return;
  window.__wgNetworkEntries = [];
  const panel = __wgById("wg-network-log");
  if (panel) panel.remove();
}
