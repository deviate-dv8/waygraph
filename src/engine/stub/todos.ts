// The floating todo dock: its items, groups, and how it folds.

/**
 * One checklist row for episode planning (demo panel).
 * Set via {@link StubCtx.todos} / {@link StubCtx.todoIndex} inside the lifecycle.
 */
export type WaygraphTodoItem = {
  text: string;
  /**
   * Stable id for external asserts / redirects (Mailhog, deep links).
   * Stamped as `data-wg-todo-item` on the row.
   */
  id?: string;
  /** Explicit done. If omitted, derived from todoIndex (index < todoIndex). */
  done?: boolean;
  /** Explicit current. If omitted, derived from todoIndex (index === todoIndex). */
  current?: boolean;
};

/** One todo item as authored: a string or `{ id, text, done }`. */
export type WaygraphTodoInput = string | WaygraphTodoItem;

/**
 * Dock list presentation:
 * - `sequential` - arrow on current, strike done (demo walkthrough)
 * - `checklist` - checkbox done/pending only (no current arrow; independent checks)
 * - `bullets` - flat bullet list (no arrow/checkbox; open notes / trimmed dock)
 */
export type TodoListStyle = "sequential" | "checklist" | "bullets";

/** One titled group in the floating todo dock (FR / Scenarios / ACs, etc.). */
export type WaygraphTodoGroupInput = {
  /** Stable group id -> `data-wg-todo-group`. */
  id?: string;
  /** Group heading shown above the items. */
  title?: string;
  /** Per-group style; falls back to dock default ({@link WaygraphTodosOpts.style}). */
  style?: TodoListStyle;
  items: readonly WaygraphTodoInput[];
  /** Sequential only: which item is current (0-based). */
  todoIndex?: number;
};

/** A titled checklist in the demo todo dock. */
export type WaygraphTodoGroup = {
  id?: string;
  title?: string;
  style: TodoListStyle;
  items: WaygraphTodoItem[];
};

/** Full floating dock payload passed to the browser. */
export type TodoDockState = {
  /**
   * Stable dock id for external targeting after redirects
   * (`#wg-todo-dock[data-wg-todo-id="…"]`).
   */
  id?: string;
  /** Default style for groups that omit their own. */
  style: TodoListStyle;
  /** Single-list title when using {@link StubCtx.todos} with `title`. */
  title?: string;
  groups: WaygraphTodoGroup[];
  pos?: "left" | "right";
};

/** Options for compact {@link StubCtx.todos}(`id`, items, opts). */
export type WaygraphTodosOpts = {
  /** Dock heading. */
  title?: string;
  /** Current item index (0-based). */
  index?: number;
  /** `sequential` | `checklist` | `bullets`. */
  style?: TodoListStyle;
  /** Dock side. */
  pos?: "left" | "right";
  /**
   * Keep other docks with different ids (multi-todo). Default false —
   * one checklist at a time (setting todos replaces the previous dock).
   */
  parallel?: boolean;
};

/**
 * Floating todo-dock UX knobs (0.15.8+). Defaults are **smart on** so long
 * FR/AC checklists do not bury highlight rings. Opt out per phase or globally.
 *
 * Defaults: `compact`, `collision`, `behindRing` = true; `cap` = 5; `expandCap` = 14.
 *
 * Global: `WAYGRAPH_TODO_UI=full` / `waygraph demo --todo-full` turns smart off.
 * Per-knob env: `WAYGRAPH_TODO_COMPACT=0`, `WAYGRAPH_TODO_COLLISION=0`,
 * `WAYGRAPH_TODO_BEHIND=0`, `WAYGRAPH_TODO_CAP`, `WAYGRAPH_TODO_EXPAND_CAP`.
 */
export type TodoDockUiOpts = {
  /** Fold long lists around the current row (+N more / hover). Default true. */
  compact?: boolean;
  /** Visible rows when compact. Default 5. */
  cap?: number;
  /** Visible rows on hover / pinned expand. Default 14. */
  expandCap?: number;
  /** Flip dock L/R when an active ring overlaps it. Default true. */
  collision?: boolean;
  /** Dim + lower z-index while a highlight ring is up. Default true. */
  behindRing?: boolean;
};

/** Resolved todo-dock UX (all fields present). */
export type TodoDockUiResolved = {
  compact: boolean;
  cap: number;
  expandCap: number;
  collision: boolean;
  behindRing: boolean;
};