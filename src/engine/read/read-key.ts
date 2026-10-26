// Read keys: what a page shows, named by namespace and field (`post.likes`), the way Mem keys name what a run carries.
import type { Reader, ReadFields } from "./readers.js";

/** A typed key into a {@link ReadPage}, named by its path (`"post.likes"`). Made by a {@link reads} namespace. */
export class ReadKey<T> {
  /** Type-only: carries `T` for `ReadPage.get`. Never set. */
  declare readonly __type?: T;

  constructor(readonly path: string) {}
}

/** One namespace's fields and the reader that fills each: what calling a namespace returns (`Post({ ... })`). */
export interface ReadSpec {
  readonly namespace: string;
  readonly fields: ReadFields;
}

/**
 * The readers a namespace's fields take, checked against its type: each field optional (a page may read part of a
 * namespace), a reader of that field's type, or for an object field, the same shape one level down.
 */
export type ReadFieldsOf<T> = {
  readonly [K in keyof T]?: Reader<T[K]> | (T[K] extends readonly unknown[] ? never : T[K] extends object ? ReadFieldsOf<T[K]> : never);
};

/** A read namespace: each property is that field's {@link ReadKey}; calling it builds the namespace's {@link ReadSpec}. */
export type ReadNamespace<T> = { readonly [K in keyof T & string]: ReadKey<T[K]> } & ((fields: ReadFieldsOf<T>) => ReadSpec);

/** Names that must not mint a key: awaiting, printing or inspecting a namespace reads these. */
const NOT_KEYS = new Set(["then", "toJSON", "constructor", "prototype", "name", "length", "call", "apply", "bind"]);

/**
 * Declares a read namespace: one type, its property names become key paths, no `const` per key.
 * @example
 * export const Post = reads("post")<{ title: string; likes: number; comments: { author: string; body: string }[] }>();
 * Post.likes;                                 // ReadKey<number>, path "post.likes"
 * Post({ title: ctx.text("h1") });            // the spec a Read Block returns
 */
export function reads(namespace: string): <T extends object>() => ReadNamespace<T> {
  return <T extends object>() => {
    const cache = new Map<string, ReadKey<unknown>>();
    const build = (fields: ReadFields): ReadSpec => ({ namespace, fields });
    return new Proxy(build, {
      get(target, prop) {
        if (typeof prop !== "string" || NOT_KEYS.has(prop)) return Reflect.get(target, prop);
        let key = cache.get(prop);
        if (!key) {
          key = new ReadKey(`${namespace}.${prop}`);
          cache.set(prop, key);
        }
        return key;
      },
    }) as unknown as ReadNamespace<T>;
  };
}
