// The keys of a read written as an object of readers (a page's or a layout's `read:`): `Page.read.sort.is("az")`. The
// namespace is the page's Checkpoint name (or `readAs`), so a run log's `catalog.items` is the same path as before.
import { ReadKey } from "./read-key.js";
import type { Reader } from "./readers.js";

/**
 * What a page's `read` returns: a reader per field (`ctx.page.text(sel)`, `.number`, `.list(...)`), or nested fields. The
 * page's field types are inferred from it: nothing is declared twice.
 */
export type PageRead = { readonly [field: string]: Reader<unknown> | PageRead };

/** The keys of a page's read, typed by what each field reads: `Page.read.sort.is("az")`, `Page.check(...)` for the rest. */
export type PageReadKeys<R> = {
  readonly [K in keyof R & string]: R[K] extends Reader<infer T> ? ReadKey<T> : R[K] extends object ? ReadKey<PageReadValue<R[K]>> & PageReadKeys<R[K]> : never;
};

/** What a nested read gives as a whole: each field's value, as an object. */
export type PageReadValue<R> = { [K in keyof R]: R[K] extends Reader<infer T> ? T : PageReadValue<R[K]> };

/** The keys of a page's read, built as they're asked for: `Page.read.sort` is the key `<namespace>.sort`, nested like the object. */
export function readKeys(namespace: string): unknown {
  const keyAt = (path: string): unknown => {
    const key = new ReadKey<unknown>(path);
    const children = new Map<string, unknown>();
    // A key is also the object a nested field hangs from: its own members win, anything else is a child.
    return new Proxy(key, {
      get(target, prop) {
        if (typeof prop !== "string" || prop in target) return Reflect.get(target, prop);
        let child = children.get(prop);
        if (!child) {
          child = keyAt(`${path}.${prop}`);
          children.set(prop, child);
        }
        return child;
      },
    });
  };
  // The namespace itself isn't a key: only its fields are.
  const roots = new Map<string, unknown>();
  return new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== "string" || prop === "then" || prop === "toJSON") return undefined;
      let key = roots.get(prop);
      if (!key) {
        key = keyAt(`${namespace}.${prop}`);
        roots.set(prop, key);
      }
      return key;
    },
  });
}

/** A Checkpoint's name as a read namespace: `SettingsSignatures` -> `settingsSignatures`. */
export const namespaceOf = (checkpointName: string): string => checkpointName.charAt(0).toLowerCase() + checkpointName.slice(1);

