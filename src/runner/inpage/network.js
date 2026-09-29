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
export function addNetworkEntry(entry) {
  // No-op outside a demo/pilot/auto run - ensureShadowRoot() (and its __wgById/__wgAdd globals)
  // is never installed for a plain `waygraph run`/Playwright test, and this must not throw there.
  if (typeof __wgById !== "function" || typeof __wgAdd !== "function") return;

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  function methodClass(method) {
    const m = (method || "GET").toUpperCase();
    if (m === "GET") return "get";
    if (m === "POST") return "post";
    if (m === "PUT" || m === "PATCH") return "put";
    if (m === "DELETE") return "delete";
    return "other";
  }

  function toCurl(e) {
    let cmd = "curl -X " + (e.method || "GET") + " '" + String(e.url || "").replace(/'/g, "'\\''") + "'";
    const headers = e.reqHeaders || {};
    for (const k of Object.keys(headers)) {
      if (/^:/.test(k)) continue; // HTTP/2 pseudo-headers - not valid curl -H input
      cmd += " \\\n  -H '" + k + ": " + String(headers[k]).replace(/'/g, "'\\''") + "'";
    }
    if (e.reqBody) cmd += " \\\n  --data '" + String(e.reqBody).replace(/'/g, "'\\''") + "'";
    return cmd;
  }

  function renderHeaders(headers) {
    const h = headers || {};
    const keys = Object.keys(h);
    if (keys.length === 0) return '<div class="wg-net-empty">(none)</div>';
    return (
      '<table class="wg-net-headers">' +
      keys.map((k) => "<tr><td>" + esc(k) + "</td><td>" + esc(h[k]) + "</td></tr>").join("") +
      "</table>"
    );
  }

  function renderBody(body) {
    if (body === undefined || body === null || body === "") return '<div class="wg-net-empty">(empty)</div>';
    let text = body;
    try {
      text = JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      /* not JSON - show raw */
    }
    return "<pre class=\"wg-net-body\">" + esc(String(text).slice(0, 4000)) + "</pre>";
  }

  function renderDetail(e) {
    return (
      '<div class="wg-net-detail-section"><h4>Request headers</h4>' +
      renderHeaders(e.reqHeaders) +
      "</div>" +
      (e.reqBody
        ? '<div class="wg-net-detail-section"><h4>Request body</h4>' + renderBody(e.reqBody) + "</div>"
        : "") +
      '<div class="wg-net-detail-section"><h4>Response headers</h4>' +
      renderHeaders(e.resHeaders) +
      "</div>" +
      '<div class="wg-net-detail-section"><h4>Response body</h4>' +
      renderBody(e.resBody) +
      "</div>" +
      '<div class="wg-net-detail-section"><h4>cURL</h4>' +
      '<pre class="wg-net-body wg-net-curl">' +
      esc(toCurl(e)) +
      "</pre>" +
      '<button type="button" class="wg-net-copy" data-copy="1">Copy as cURL</button></div>'
    );
  }

  let panel = __wgById("wg-network-log");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "wg-network-log";
    panel.setAttribute("data-wg-ui", "1");
    const header = document.createElement("div");
    header.className = "wg-net-header";
    const title = document.createElement("span");
    title.className = "wg-net-title";
    title.textContent = "Network";
    const count = document.createElement("span");
    count.className = "wg-net-count";
    count.textContent = "0";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wg-net-collapse";
    toggle.textContent = "−"; // minus
    toggle.addEventListener("click", (ev) => {
      ev.stopPropagation();
      panel.classList.toggle("wg-net-collapsed");
      toggle.textContent = panel.classList.contains("wg-net-collapsed") ? "+" : "−";
    });
    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(toggle);
    const list = document.createElement("ol");
    list.className = "wg-net-list";
    panel.appendChild(header);
    panel.appendChild(list);
    __wgAdd(panel);
  }

  const w = window;
  w.__wgNetworkEntries = w.__wgNetworkEntries || [];
  w.__wgNetworkEntries.push(entry);
  while (w.__wgNetworkEntries.length > 30) w.__wgNetworkEntries.shift();

  const list = panel.querySelector(".wg-net-list");
  const row = document.createElement("li");
  row.className = "wg-net-row";
  row.dataset.ok = entry.ok ? "1" : "0";
  let path = entry.url;
  try {
    const u = new URL(entry.url);
    path = u.pathname + u.search;
  } catch {
    /* not an absolute URL - show as given */
  }
  row.innerHTML =
    '<span class="wg-net-method wg-net-method-' +
    methodClass(entry.method) +
    '">' +
    esc((entry.method || "GET").toUpperCase()) +
    '</span><span class="wg-net-path" title="' +
    esc(entry.url) +
    '">' +
    esc(path) +
    '</span><span class="wg-net-status">' +
    esc(entry.status) +
    (entry.ms !== undefined ? '</span><span class="wg-net-ms">' + esc(entry.ms) + "ms</span>" : "</span>");
  row.addEventListener("click", () => {
    const open = row.classList.contains("wg-net-open");
    __wgQA(".wg-net-row.wg-net-open").forEach((r) => {
      r.classList.remove("wg-net-open");
      const d = r.nextElementSibling;
      if (d && d.classList && d.classList.contains("wg-net-detail")) d.remove();
    });
    if (open) return;
    row.classList.add("wg-net-open");
    const detail = document.createElement("li");
    detail.className = "wg-net-detail";
    detail.innerHTML = renderDetail(entry);
    const copyBtn = detail.querySelector("[data-copy]");
    if (copyBtn) {
      copyBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const text = toCurl(entry);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        copyBtn.textContent = "Copied!";
        setTimeout(() => {
          copyBtn.textContent = "Copy as cURL";
        }, 1200);
      });
    }
    row.after(detail);
  });
  list.appendChild(row);
  while (list.children.length > 30) list.removeChild(list.firstChild);
  const countEl = panel.querySelector(".wg-net-count");
  if (countEl) countEl.textContent = String(w.__wgNetworkEntries.length);
  panel.classList.remove("wg-out");
  void panel.offsetWidth;
  panel.classList.add("wg-in");
  void row.offsetWidth;
  row.classList.add("wg-in");
}

/** Clears every captured entry and removes the panel - a fresh navigation/session starting over. */
export function clearNetworkLog() {
  if (typeof __wgById !== "function") return;
  window.__wgNetworkEntries = [];
  const panel = __wgById("wg-network-log");
  if (panel) panel.remove();
}
