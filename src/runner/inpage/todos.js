// In-page installer (runs inside the browser via page.evaluate): must stay self-contained - no module-scope closure.
// Split out of the former single installOverlay evaluate (see src/ARCHITECTURE.md). Shares state only via window.__wg*.
/* eslint-disable no-unused-vars */
export function installTodos({ title, favicon, bannerPos, todoPos, envAutoplay, todoDockUi }) {
        // Floating todo dock - lives outside #wg-panel so --mini / Hide never
        // hide the checklist. Click cycles left <-> right with CSS transform.
        // Authors set side via ctx.todoPos("left"|"right"); env / --todo-* fallback.
        // Payload:
        //   { sync: "clear" }                         -> remove dock
        //   { sync: "keep" }                          -> leave dock alone (no wipe)
        //   { sync: "set", dock } / { sync:"set", list } -> render / recreate
        // Compat: bare array = set list (empty array = clear - legacy only).
        window.__wgSyncTodos = (payload, pos) => {
          const syncPayload = payload;
          let sync = "set";
          let list = [];
          let dockState = null;
          let wantPos =
            pos === "left" || pos === "right" ? pos : null;
          if (Array.isArray(payload)) {
            list = payload;
            sync = list.length ? "set" : "clear";
          } else if (payload && typeof payload === "object") {
            sync = payload.sync === "clear" || payload.sync === "keep" ? payload.sync : "set";
            dockState = payload.dock || null;
            if (payload.pos === "left" || payload.pos === "right") wantPos = payload.pos;
            if (Array.isArray(payload.list)) list = payload.list;
            else if (dockState && Array.isArray(dockState.groups)) {
              // Flatten for legacy callers; full dock rendered below when present.
              list = [];
              for (const g of dockState.groups) {
                if (g && Array.isArray(g.items)) list = list.concat(g.items);
              }
            }
          } else {
            list = [];
            sync = "clear";
          }

          let dockKey =
            (dockState && dockState.id && String(dockState.id).trim()) ||
            (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
            "_default";

          // Drop any in-panel leftover (old builds put #wg-todos in .wg-body).
          __wgQA("#wg-panel #wg-todos").forEach((el) => el.remove());

          const allDocks = () =>
            [...__wgQA(".wg-todo-dock, #wg-todo-dock")].filter(
              (el, i, arr) => arr.indexOf(el) === i,
            );
          const relayoutTodoDocks = () => {
            const docks = allDocks();
            let top = 72;
            for (const el of docks) {
              el.style.top = top + "px";
              top += Math.max(48, el.getBoundingClientRect().height) + 10;
            }
          };
          const findDock = (key) => {
            if (key === "_default") {
              return (
                __wgQ('.wg-todo-dock[data-wg-todo-key="_default"]') ||
                __wgById("wg-todo-dock")
              );
            }
            const all = __wgQA(".wg-todo-dock");
            for (let i = 0; i < all.length; i++) {
              if (all[i].getAttribute("data-wg-todo-key") === String(key)) return all[i];
            }
            return null;
          };

          // keep + no new payload: do not remove existing docks (PIA #10).
          if (sync === "keep") {
            if (!dockState && !list.length) return;
            // After navigation the DOM may be gone - recreate from carried dock.
            sync = "set";
          }
          // Default replace=true: one checklist. parallel docks only when replace:false.
          const replace =
            !(payload && !Array.isArray(payload) && payload.replace === false) &&
            !(payload && !Array.isArray(payload) && payload.parallel === true);
          const hasDock =
            !!(dockState && Array.isArray(dockState.groups) && dockState.groups.length);
          // Explicit clear only - never treat "set + dock + empty list" as clear
          // (that thrash was marks -> blank in a few ms).
          if (sync === "clear" || (sync === "set" && !hasDock && !list.length)) {
            const clearId =
              (payload && !Array.isArray(payload) && payload.todoId && String(payload.todoId).trim()) ||
              (dockState && dockState.id && String(dockState.id).trim()) ||
              "";
            if (clearId && !replace) {
              const el = findDock(clearId);
              if (el) el.remove();
            } else {
              allDocks().forEach((el) => el.remove());
            }
            relayoutTodoDocks();
            return;
          }

          if (sync === "set" && replace) {
            // Drop sibling docks so we never stack duplicates.
            for (const el of allDocks()) {
              const key = el.getAttribute("data-wg-todo-key") || "_default";
              if (key !== dockKey) el.remove();
            }
          }

          const POS = ["left", "right"];
          let dock = findDock(dockKey);
          if (!dock) {
            dock = document.createElement("div");
            dock.className = "wg-todo-dock";
            dock.setAttribute("data-wg-todo-key", dockKey);
            if (dockKey === "_default") dock.id = "wg-todo-dock";
            else dock.id = "wg-todo-dock--" + dockKey.replace(/[^a-zA-Z0-9_-]/g, "-");
            dock.setAttribute("data-wg-ui", "1");
            dock.setAttribute("data-wg-modal", "todos");
            dock.setAttribute("data-wg-ready", "1");
            let saved = null;
            try {
              saved = localStorage.getItem("wg-todo-pos");
            } catch {
              /* ignore */
            }
            const start =
              wantPos ||
              (saved && POS.includes(saved) ? saved : todoPos === "right" ? "right" : "left");
            dock.dataset.pos = start;
            dock.title = "Click to move checklist: left / right";
            dock.addEventListener("click", (e) => {
              e.stopPropagation();
              const i = POS.indexOf(dock.dataset.pos || "left");
              const next = POS[(i + 1) % POS.length];
              dock.dataset.pos = next;
              try {
                localStorage.setItem("wg-todo-pos", next);
              } catch {
                /* ignore */
              }
            });
            __wgAdd(dock);
          } else if (wantPos) {
            dock.dataset.pos = wantPos;
            try {
              localStorage.setItem("wg-todo-pos", wantPos);
            } catch {
              /* ignore */
            }
          }

          const esc = (s) =>
            String(s)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const attrId = (raw) => {
            const id = raw != null && String(raw).trim() ? String(raw).trim() : "";
            return id ? ' data-wg-todo-item="' + esc(id) + '"' : "";
          };
          // Compact + cap: >cap rows folds overflow; hover shows up to expandCap; "+N more" pins expand.
          const ui = (payload && !Array.isArray(payload) && payload.ui) || window.__wgTodoDockUi || {};
          const COMPACT_AT = Number(ui.cap) > 0 ? Number(ui.cap) : 5;
          const WINDOW = COMPACT_AT;
          const EXPAND_MAX = Number(ui.expandCap) > 0 ? Number(ui.expandCap) : 14;
          const compactEnabled = ui.compact !== false;
          const flattenItems = () => {
            if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
              const out = [];
              for (const g of dockState.groups) {
                for (const t of g.items || []) out.push({ ...t, __style: g.style || dockState.style });
              }
              return out;
            }
            return (list || []).map((t) => ({ ...t, __style: "sequential" }));
          };
          const windowBounds = (items, cap) => {
            const n = items.length;
            if (n <= cap) return { start: 0, end: n };
            let cur = items.findIndex((t) => t.current);
            if (cur < 0) cur = items.findIndex((t) => !t.done);
            if (cur < 0) cur = 0;
            let start = Math.max(0, cur - Math.floor((cap - 1) / 2));
            let end = Math.min(n, start + cap);
            start = Math.max(0, end - cap);
            return { start, end };
          };
          const renderItems = (items, style, foldMeta, indexOffset) => {
            const offset = indexOffset || 0;
            const rawStyle = String(style || "sequential").toLowerCase();
            const st =
              rawStyle === "checklist"
                ? "checklist"
                : rawStyle === "bullets" ||
                    rawStyle === "bullet" ||
                    rawStyle === "list" ||
                    rawStyle === "ul" ||
                    rawStyle === "points" ||
                    rawStyle === "plain"
                  ? "bullets"
                  : "sequential";
            const foldStart = foldMeta ? foldMeta.foldStart : -1;
            const foldEnd = foldMeta ? foldMeta.foldEnd : -1;
            const deepStart = foldMeta ? foldMeta.deepStart : -1;
            const deepEnd = foldMeta ? foldMeta.deepEnd : -1;
            return (
              '<ul class="wg-todos-list" data-wg-todo-style="' +
              st +
              '">' +
              (items || [])
                .map((t, idx) => {
                  const gi = offset + idx;
                  const clsBase =
                    st === "bullets"
                      ? t.done
                        ? "wg-todo-done"
                        : "wg-todo-pending"
                      : t.current
                        ? "wg-todo-current"
                        : t.done
                          ? "wg-todo-done"
                          : "wg-todo-pending";
                  let foldCls = "";
                  if (foldStart >= 0 && (gi < foldStart || gi >= foldEnd)) foldCls += " wg-todo-fold";
                  if (deepStart >= 0 && (gi < deepStart || gi >= deepEnd)) foldCls += " wg-todo-fold-deep";
                  let mark;
                  if (st === "checklist") {
                    mark = t.done ? "☑" : "☐";
                  } else if (st === "bullets") {
                    mark = "•";
                  } else {
                    mark = t.done ? "✓" : t.current ? "→" : "○";
                  }
                  const rowId = t.id || t.name || "";
                  return (
                    '<li class="' +
                    clsBase +
                    foldCls +
                    '"' +
                    attrId(rowId) +
                    '><span class="wg-todo-mark">' +
                    mark +
                    "</span><span>" +
                    esc(t.text || "") +
                    "</span></li>"
                  );
                })
                .join("") +
              "</ul>"
            );
          };

          if (dockKey !== "_default") dock.setAttribute("data-wg-todo-id", dockKey);
          else dock.removeAttribute("data-wg-todo-id");

          const flat = flattenItems();
          const compact = compactEnabled && flat.length > COMPACT_AT;
          const win = windowBounds(flat, WINDOW);
          const expand = windowBounds(flat, EXPAND_MAX);
          const foldMeta = compact
            ? {
                foldStart: win.start,
                foldEnd: win.end,
                deepStart: expand.start,
                deepEnd: expand.end,
              }
            : null;
          const hiddenCompact = compact ? flat.length - (win.end - win.start) : 0;
          const hiddenExpand = compact ? flat.length - (expand.end - expand.start) : 0;

          let html = "";
          if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
            const dockTitle = dockState.title && String(dockState.title).trim();
            if (dockTitle) {
              html += '<div class="wg-todo-dock-title">' + esc(dockTitle) + "</div>";
            }
            let globalIdx = 0;
            for (const g of dockState.groups) {
              const gTitle = g.title && String(g.title).trim();
              const gid = g.id || g.name || "";
              html +=
                '<div class="wg-todo-group"' +
                (gid ? ' data-wg-todo-group="' + esc(gid) + '"' : "") +
                ">";
              if (gTitle) {
                html += '<div class="wg-todo-group-title">' + esc(gTitle) + "</div>";
              }
              const gItems = g.items || [];
              html += renderItems(gItems, g.style || dockState.style, foldMeta, globalIdx);
              html += "</div>";
              globalIdx += gItems.length;
            }
          } else {
            html = renderItems(list, "sequential", foldMeta, 0);
          }
          if (compact && hiddenCompact > 0) {
            const n = dock.dataset.expanded === "1" ? hiddenExpand : hiddenCompact;
            if (n > 0) {
              html +=
                '<div class="wg-todo-more" data-wg-todo-more="1" title="Click to expand / collapse">' +
                "+" +
                n +
                " more</div>";
            }
          }
          if (compact) dock.dataset.compact = "1";
          else {
            delete dock.dataset.compact;
            delete dock.dataset.expanded;
          }
          dock.innerHTML = html;
          const moreBtn = dock.querySelector("[data-wg-todo-more]");
          if (moreBtn) {
            moreBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (dock.dataset.expanded === "1") delete dock.dataset.expanded;
              else dock.dataset.expanded = "1";
              if (window.__wgSyncTodos && dock._wgLastPayload) {
                window.__wgSyncTodos(dock._wgLastPayload);
              }
            });
          }
          dock._wgLastPayload = syncPayload;
          relayoutTodoDocks();
          if (window.__wgStampModal) {
            window.__wgStampModal(dock, "todos", { ready: true });
          }
        };
}
