// In-page (runs inside the browser via page.evaluate, must stay self-contained): the todo dock(s).
import type { OverlayInstallArgs } from "../../types.js";
export function installTodos({ todoPos }: OverlayInstallArgs) {
        // Floating todo dock - lives outside #wg-panel so --mini / Hide never
        // hide the checklist. Click cycles left <-> right with CSS transform.
        // Authors set side via ctx.todos(id, items, { pos }); env / --todo-* fallback.
        // Payload:
        //   { sync: "clear" }                         -> remove dock
        //   { sync: "keep" }                          -> leave dock alone (no wipe)
        //   { sync: "set", dock } / { sync:"set", list } -> render / recreate
        window.__wgSyncTodos = (payload, pos) => {
          const syncPayload = payload;
          let sync = "set";
          let list: readonly WgTodoRow[] = [];
          let dockState: WgTodoDockRow | null = null;
          let wantPos =
            pos === "left" || pos === "right" ? pos : null;
          if (payload && typeof payload === "object") {
            sync = payload.sync === "clear" || payload.sync === "keep" ? payload.sync : "set";
            dockState = payload.dock || null;
            if (payload.pos === "left" || payload.pos === "right") wantPos = payload.pos;
            if (Array.isArray(payload.list)) list = payload.list;
            else if (dockState && Array.isArray(dockState.groups)) {
              // The flat list; the full dock is rendered below.
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
          const findDock = (key: string) => {
            if (key === "_default") {
              return (
                __wgQ('.wg-todo-dock[data-wg-todo-key="_default"]') ||
                __wgById("wg-todo-dock")
              );
            }
            const all = __wgQA(".wg-todo-dock");
            for (let i = 0; i < all.length; i++) {
              if (all[i]!.getAttribute("data-wg-todo-key") === String(key)) return all[i];
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
              const i = POS.indexOf(dock!.dataset.pos || "left");
              const next = POS[(i + 1) % POS.length];
              dock!.dataset.pos = next;
              try {
                localStorage.setItem("wg-todo-pos", next ?? "left");
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

          const trimmedId = (raw: string | undefined) => (raw != null && String(raw).trim() ? String(raw).trim() : undefined);
          // Compact + cap: >cap rows folds overflow; hover shows up to expandCap; "+N more" pins expand.
          const ui = (payload && !Array.isArray(payload) && payload.ui) || window.__wgTodoDockUi || {};
          const COMPACT_AT = Number(ui.cap) > 0 ? Number(ui.cap) : 5;
          const WINDOW = COMPACT_AT;
          const EXPAND_MAX = Number(ui.expandCap) > 0 ? Number(ui.expandCap) : 14;
          const compactEnabled = ui.compact !== false;
          const flattenItems = () => {
            if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
              const out: Array<WgTodoRow & { __style?: string | undefined }> = [];
              for (const g of dockState.groups) {
                for (const t of g.items || []) out.push({ ...t, __style: g.style || dockState.style });
              }
              return out;
            }
            return (list || []).map((t) => ({ ...t, __style: "sequential" }));
          };
          const windowBounds = (items: readonly WgTodoRow[], cap: number) => {
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
          const renderItems = (items: readonly WgTodoRow[], style: string | undefined, foldMeta: { foldStart: number; foldEnd: number; deepStart: number; deepEnd: number } | null, indexOffset: number) => {
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
            return __wgEl(
              "ul",
              { class: "wg-todos-list", data: { wgTodoStyle: st } },
              (items || []).map((t, idx) => {
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
                return __wgEl(
                  "li",
                  { class: clsBase + foldCls, data: { wgTodoItem: trimmedId(t.id) } },
                  __wgEl("span", { class: "wg-todo-mark" }, mark),
                  __wgEl("span", null, t.text || ""),
                );
              }),
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

          const children: WgChild[] = [];
          if (dockState && Array.isArray(dockState.groups) && dockState.groups.length) {
            const dockTitle = dockState.title && String(dockState.title).trim();
            if (dockTitle) children.push(__wgEl("div", { class: "wg-todo-dock-title" }, dockTitle));
            let globalIdx = 0;
            for (const g of dockState.groups) {
              const gTitle = g.title && String(g.title).trim();
              const gItems = g.items || [];
              children.push(
                __wgEl(
                  "div",
                  { class: "wg-todo-group", data: { wgTodoGroup: trimmedId(g.id) } },
                  gTitle ? __wgEl("div", { class: "wg-todo-group-title" }, gTitle) : null,
                  renderItems(gItems, g.style || dockState.style, foldMeta, globalIdx),
                ),
              );
              globalIdx += gItems.length;
            }
          } else {
            children.push(renderItems(list, "sequential", foldMeta, 0));
          }
          if (compact && hiddenCompact > 0) {
            const n = dock.dataset.expanded === "1" ? hiddenExpand : hiddenCompact;
            if (n > 0) {
              children.push(__wgEl("div", { class: "wg-todo-more", data: { wgTodoMore: "1" }, title: "Click to expand / collapse" }, "+" + n + " more"));
            }
          }
          if (compact) dock.dataset.compact = "1";
          else {
            delete dock.dataset.compact;
            delete dock.dataset.expanded;
          }
          __wgSet(dock, children);
          const moreBtn = dock.querySelector<HTMLElement>("[data-wg-todo-more]");
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
          if (window.__wgStampModal) {
            window.__wgStampModal(dock, "todos", { ready: true });
          }
        };
}
