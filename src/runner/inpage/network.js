// In-page installer (page.evaluate target) - must stay self-contained, no module-scope closure.
// A live network-activity panel (`#wg-network-log`) for `defineApiBlock` calls: the DevTools
// Network tab's own panel can't be embedded (it lives in browser chrome, not reachable from
// automation), but Playwright's request/response data is fully available - this renders exactly
// that, on-page, so an API step (invisible otherwise: no DOM change, no ring) is actually visible
// in a demo/recording instead of flashing by as a silent title change.
export function showNetworkEntry({ url, status, ok, ms }) {
  // No-op outside a demo/pilot/auto run - ensureShadowRoot() (and its __wgById/__wgAdd globals)
  // is never installed for a plain `waygraph run`/Playwright test, and this must not throw there.
  if (typeof __wgById !== "function" || typeof __wgAdd !== "function") return;
  let panel = __wgById("wg-network-log");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "wg-network-log";
    panel.setAttribute("data-wg-ui", "1");
    const title = document.createElement("div");
    title.className = "wg-net-title";
    title.textContent = "Network";
    const list = document.createElement("ol");
    list.className = "wg-net-list";
    panel.appendChild(title);
    panel.appendChild(list);
    __wgAdd(panel);
  }
  const list = panel.querySelector(".wg-net-list");
  const row = document.createElement("li");
  row.className = "wg-net-row";
  row.dataset.ok = ok ? "1" : "0";
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    /* not an absolute URL - show as given */
  }
  row.innerHTML =
    '<span class="wg-net-path">' +
    path +
    '</span><span class="wg-net-status">' +
    status +
    (ms !== undefined ? '</span><span class="wg-net-ms">' + ms + "ms</span>" : "</span>");
  list.appendChild(row);
  // Cap history - a running demo shouldn't grow this panel (or the DOM) without bound.
  while (list.children.length > 8) list.removeChild(list.firstChild);
  panel.classList.remove("wg-out");
  void panel.offsetWidth;
  panel.classList.add("wg-in");
  void row.offsetWidth;
  row.classList.add("wg-in");
  if (panel._wgTimer) clearTimeout(panel._wgTimer);
  panel._wgTimer = setTimeout(() => {
    panel.classList.add("wg-out");
    panel.classList.remove("wg-in");
  }, 4000);
}
