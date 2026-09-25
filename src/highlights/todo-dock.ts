// Split out of the former 2,100-line highlights.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { TodoDockState, TodoDockUiOpts, TodoDockUiResolved, TodoListStyle, WaygraphTodoGroup, WaygraphTodoGroupInput, WaygraphTodoInput, WaygraphTodoItem } from "./types.js";

function envFlagBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const v = env[key];
  if (v === undefined || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "0" || s === "false" || s === "off" || s === "no") return false;
  if (s === "1" || s === "true" || s === "on" || s === "yes") return true;
  return fallback;
}


function envFlagInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const n = Number(env[key]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}


/**
 * Resolve todo-dock UX from env + optional author patch.
 * `WAYGRAPH_TODO_UI=full|off|legacy` forces compact/collision/behindRing off.
 */
export function resolveTodoDockUi(
  patch?: TodoDockUiOpts | null,
  env: NodeJS.ProcessEnv = process.env,
): TodoDockUiResolved {
  const mode = String(env.WAYGRAPH_TODO_UI || "smart")
    .trim()
    .toLowerCase();
  const full =
    mode === "full" || mode === "off" || mode === "0" || mode === "legacy" || mode === "classic";
  const base: TodoDockUiResolved = {
    compact: full ? false : envFlagBool(env, "WAYGRAPH_TODO_COMPACT", true),
    collision: full ? false : envFlagBool(env, "WAYGRAPH_TODO_COLLISION", true),
    behindRing: full ? false : envFlagBool(env, "WAYGRAPH_TODO_BEHIND", true),
    cap: envFlagInt(env, "WAYGRAPH_TODO_CAP", 5),
    expandCap: envFlagInt(env, "WAYGRAPH_TODO_EXPAND_CAP", 14),
  };
  if (base.expandCap < base.cap) base.expandCap = base.cap;
  if (!patch) return base;
  const cap =
    patch.cap !== undefined && Number.isFinite(patch.cap)
      ? Math.max(1, Math.floor(Number(patch.cap)))
      : base.cap;
  let expandCap =
    patch.expandCap !== undefined && Number.isFinite(patch.expandCap)
      ? Math.max(1, Math.floor(Number(patch.expandCap)))
      : base.expandCap;
  if (expandCap < cap) expandCap = cap;
  return {
    compact: patch.compact !== undefined ? !!patch.compact : base.compact,
    collision: patch.collision !== undefined ? !!patch.collision : base.collision,
    behindRing: patch.behindRing !== undefined ? !!patch.behindRing : base.behindRing,
    cap,
    expandCap,
  };
}


/** Normalize checklist dock side. */
export function normalizeTodoPos(raw: unknown): "left" | "right" | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "left" || s === "l") return "left";
  if (s === "right" || s === "r") return "right";
  return undefined;
}


/** Normalize dock list style. */
export function normalizeTodoStyle(raw: unknown): TodoListStyle | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "sequential" || s === "seq" || s === "steps" || s === "step") return "sequential";
  if (s === "checklist" || s === "check" || s === "checks" || s === "box") return "checklist";
  if (
    s === "bullets" ||
    s === "bullet" ||
    s === "list" ||
    s === "ul" ||
    s === "points" ||
    s === "plain"
  ) {
    return "bullets";
  }
  return undefined;
}


/**
 * Normalize checklist rows; apply todoIndex for sequential done/current.
 * In checklist / bullets mode, todoIndex is ignored unless items omit explicit done
 * (bullets never auto-mark current).
 */
export function normalizeTodos(
  todos: readonly WaygraphTodoInput[] | undefined,
  todoIndex?: number,
  style: TodoListStyle = "sequential",
): WaygraphTodoItem[] {
  if (!todos || todos.length === 0) return [];
  const idx =
    todoIndex !== undefined && Number.isFinite(todoIndex) ? Math.floor(todoIndex) : undefined;
  return todos.map((t, i) => {
    const text = typeof t === "string" ? t.trim() : String(t?.text ?? "").trim();
    const item: WaygraphTodoItem = { text: text || `Item ${i + 1}` };
    if (typeof t === "object" && t) {
      if (t.done !== undefined) item.done = !!t.done;
      if (t.current !== undefined) item.current = !!t.current;
      const idRaw = t.id ?? t.name;
      if (idRaw != null && String(idRaw).trim()) item.id = String(idRaw).trim();
    }
    if (style === "checklist") {
      if (item.done === undefined) item.done = false;
      item.current = false;
      return item;
    }
    if (style === "bullets") {
      // Flat list: no walkthrough current; keep explicit done if authored.
      item.current = false;
      return item;
    }
    if (idx !== undefined) {
      if (item.done === undefined) item.done = i < idx;
      if (item.current === undefined) item.current = i === idx;
    }
    return item;
  });
}


/** Build the floating dock from bag / phase fields. */
export function buildTodoDock(opts: {
  todos?: readonly WaygraphTodoInput[] | undefined;
  todoIndex?: number | undefined;
  todoTitle?: string | undefined;
  todoId?: string | undefined;
  todoStyle?: TodoListStyle | undefined;
  todoGroups?: readonly WaygraphTodoGroupInput[] | undefined;
  todoPos?: "left" | "right" | undefined;
}): TodoDockState | undefined {
  const style = normalizeTodoStyle(opts.todoStyle) || "sequential";
  const pos = normalizeTodoPos(opts.todoPos);
  const dockId =
    opts.todoId != null && String(opts.todoId).trim() ? String(opts.todoId).trim() : undefined;
  if (opts.todoGroups && opts.todoGroups.length) {
    const groups: WaygraphTodoGroup[] = opts.todoGroups
      .map((g) => {
        const gs = normalizeTodoStyle(g.style) || style;
        const items = normalizeTodos(g.items, g.todoIndex, gs);
        if (!items.length) return null;
        const group: WaygraphTodoGroup = { style: gs, items };
        if (g.title && String(g.title).trim()) group.title = String(g.title).trim();
        const gid = g.id ?? g.name;
        if (gid != null && String(gid).trim()) group.id = String(gid).trim();
        return group;
      })
      .filter((g): g is WaygraphTodoGroup => !!g);
    if (!groups.length) return undefined;
    const dock: TodoDockState = { style, groups };
    if (pos) dock.pos = pos;
    if (dockId) dock.id = dockId;
    return dock;
  }
  const items = normalizeTodos(opts.todos, opts.todoIndex, style);
  if (!items.length) return undefined;
  const group: WaygraphTodoGroup = { style, items };
  // Title once on the dock - not also on the lone group (avoids duplicate headings).
  const dock: TodoDockState = { style, groups: [group] };
  if (opts.todoTitle && String(opts.todoTitle).trim()) {
    dock.title = String(opts.todoTitle).trim();
  }
  if (pos) dock.pos = pos;
  if (dockId) dock.id = dockId;
  return dock;
}


/**
 * Carry-forward rules for the floating todo dock across demo steps.
 * - clear: author called hideTodos / empty todos()
 * - set: author authored a new dock this phase
 * - keep: author omitted todos — preserve previous dock (do not wipe)
 */
export function applyTodoPhase(
  prev: TodoDockState | undefined,
  phase: {
    todoSync?: "set" | "clear" | "keep";
    todoDock?: TodoDockState;
    todos?: WaygraphTodoItem[];
    todoPos?: "left" | "right";
    todoId?: string;
  },
): { dock: TodoDockState | undefined; sync: "set" | "clear" | "keep" } {
  const sync =
    phase.todoSync ||
    (phase.todoDock ? "set" : phase.todos && phase.todos.length ? "set" : "keep");
  if (sync === "clear") return { dock: undefined, sync: "clear" };
  if (sync === "set") {
    if (phase.todoDock) return { dock: phase.todoDock, sync: "set" };
    if (phase.todos && phase.todos.length) {
      const dock = buildTodoDock({
        todos: phase.todos,
        ...(phase.todoPos ? { todoPos: phase.todoPos } : {}),
        ...(phase.todoId ? { todoId: phase.todoId } : {}),
      });
      return { dock, sync: "set" };
    }
    return { dock: undefined, sync: "clear" };
  }
  return { dock: prev, sync: "keep" };
}


/**
 * Advance every sequential group to `index` (capped). Checklist / bullets unchanged.
 * Used while cycling rings / fill/click stubs so the walkthrough moves.
 */
export function advanceTodoDock(dock: TodoDockState | undefined, index: number): TodoDockState | undefined {
  if (!dock || !dock.groups.length) return dock;
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return {
    ...dock,
    groups: dock.groups.map((g) => {
      if (g.style !== "sequential") return g;
      const capped = Math.min(i, Math.max(0, g.items.length - 1));
      const raw = g.items.map((it) => {
        const row: WaygraphTodoItem = { text: it.text };
        if (it.id) row.id = it.id;
        else if (it.name) row.id = it.name;
        return row;
      });
      return {
        ...g,
        items: normalizeTodos(raw, capped, "sequential"),
      };
    }),
  };
}


/**
 * Mark sequential groups complete (all done, none current) - e.g. end of step.
 * Checklist / bullets groups keep explicit done flags.
 */
export function completeSequentialTodoDock(
  dock: TodoDockState | undefined,
): TodoDockState | undefined {
  if (!dock) return dock;
  return {
    ...dock,
    groups: dock.groups.map((g) => {
      if (g.style !== "sequential") return g;
      return {
        ...g,
        items: g.items.map((it) => {
          const row: WaygraphTodoItem = { text: it.text, done: true, current: false };
          if (it.id) row.id = it.id;
          else if (it.name) row.id = it.name;
          return row;
        }),
      };
    }),
  };
}
