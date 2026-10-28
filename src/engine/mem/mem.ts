// Mem: the values a run carries between Blocks (credentials, the row just added), typed by MemKey.
import { WaygraphError, MSG_MEM_READ_BEFORE_SET } from "../errors.js";
/**
 * A typed key into MemPage. The phantom `_phantom` field is never assigned - it
 * exists only so TypeScript can infer `T` at each call site. The store is keyed by
 * the MemKey *instance* (object identity), not by `name`, so two keys can share a
 * debug name and never collide - `name` is for error messages only.
 */
export class MemKey<T> {
  // `declare` - type-only, never assigned, erased at compile time. Exists purely
  // so TypeScript can infer T at each call site; exempt from unused-field checks
  // because it has no runtime value to be "unused".
  declare private readonly _phantom: T;

  constructor(readonly name: string) {}
}

/** A Mem namespace: each property is that field's {@link MemKey}, named `"<namespace>.<field>"`. */
export type KeyNamespace<T> = { readonly [K in keyof T & string]: MemKey<T[K]> };

/** Names that must not mint a key: awaiting, printing or inspecting a namespace reads these. */
const NOT_KEYS = new Set(["then", "toJSON", "constructor", "prototype", "valueOf", "toString", "inspect"]);

/**
 * Declares the Mem keys of one namespace in one line: a type, whose property names become the keys
 * (`"<namespace>.<field>"`, the name `--data` and the run log use). Each property is one key, the same object every
 * time it is read - Mem stores values by key.
 * @example
 * export const SaucedemoKeys = keys("saucedemo")<{ credentials: { username: string; password: string } }>();
 * mem.set(SaucedemoKeys.credentials, { username: "standard_user", password: "secret_sauce" });
 * requires: [SaucedemoKeys.credentials]
 */
export function keys(namespace: string): <T extends object>() => KeyNamespace<T> {
  return <T extends object>() => {
    const cache = new Map<string, MemKey<unknown>>();
    return new Proxy({} as KeyNamespace<T>, {
      get(target, prop) {
        if (typeof prop !== "string" || NOT_KEYS.has(prop)) return Reflect.get(target, prop);
        let k = cache.get(prop);
        if (!k) {
          k = new MemKey(`${namespace}.${prop}`);
          cache.set(prop, k);
        }
        return k;
      },
    });
  };
}

/**
 * Typed, identity-keyed shared memory for one graph run. Reading a key that was
 * never written throws immediately, naming the key, instead of returning
 * `undefined` - a misuse fails loud at the read site, not silently downstream.
 */
export class MemPage {
  private readonly store = new Map<MemKey<unknown>, unknown>();

  /** `mem.set(SaucedemoKeys.credentials, { ... })`. */
  set<T>(k: MemKey<T>, value: T): void {
    this.store.set(k as MemKey<unknown>, value);
  }

  /**
   * Reads `k`'s value, throwing (naming `k`) if it was never `set` - never
   * returns `undefined` for a genuinely missing key, so a misuse fails loud at
   * the read site instead of surfacing as a confusing error deep in `act`.
   * @example const { username, password } = mem.get(SaucedemoKeys.credentials);
   */
  get<T>(k: MemKey<T>): T {
    if (!this.store.has(k as MemKey<unknown>)) {
      throw new WaygraphError("WG_MEM_READ_BEFORE_SET", MSG_MEM_READ_BEFORE_SET(k.name));
    }
    return this.store.get(k as MemKey<unknown>) as T;
  }

  /** True once `k` has been `set` - use before a `get` that's genuinely optional. */
  has<T>(k: MemKey<T>): boolean {
    return this.store.has(k as MemKey<unknown>);
  }

  /** Covers add/remove/insert/nest generically - MemPage never needs to know the shape of T. */
  update<T>(k: MemKey<T>, fn: (current: T) => T): void {
    this.set(k, fn(this.get(k)));
  }

  /**
   * Sets several keys in one call - `mem.setAll([Login.username, "standard_user"], [Login.password, "secret_sauce"])`
   * instead of one `.set()` per line. Can't take a plain `{ ... }` object literal:
   * MemKey instances are the identity the store is keyed by, and object literals
   * can only have string/symbol property names, not object instances - a `[key,
   * value]` pair is the shape that keeps that identity-based guarantee.
   *
   * Overloaded per pair count (2-6, per-arity overloads like the old `defineFlow`'s
   * overloads) rather than one fully-generic variadic signature - each pair binds
   * its own type parameter independently, which TS checks reliably; a single
   * self-referential mapped-tuple-over-a-rest-parameter type was tried first and
   * silently failed to catch a mismatched pair, so it was not trusted over this.
   */
  setAll<A>(p1: readonly [MemKey<A>, A]): void;
  setAll<A, B>(p1: readonly [MemKey<A>, A], p2: readonly [MemKey<B>, B]): void;
  setAll<A, B, C>(
    p1: readonly [MemKey<A>, A],
    p2: readonly [MemKey<B>, B],
    p3: readonly [MemKey<C>, C],
  ): void;
  setAll<A, B, C, D>(
    p1: readonly [MemKey<A>, A],
    p2: readonly [MemKey<B>, B],
    p3: readonly [MemKey<C>, C],
    p4: readonly [MemKey<D>, D],
  ): void;
  setAll<A, B, C, D, E>(
    p1: readonly [MemKey<A>, A],
    p2: readonly [MemKey<B>, B],
    p3: readonly [MemKey<C>, C],
    p4: readonly [MemKey<D>, D],
    p5: readonly [MemKey<E>, E],
  ): void;
  setAll<A, B, C, D, E, F>(
    p1: readonly [MemKey<A>, A],
    p2: readonly [MemKey<B>, B],
    p3: readonly [MemKey<C>, C],
    p4: readonly [MemKey<D>, D],
    p5: readonly [MemKey<E>, E],
    p6: readonly [MemKey<F>, F],
  ): void;
  setAll(...pairs: readonly (readonly [MemKey<unknown>, unknown])[]): void {
    for (const [k, v] of pairs) {
      this.set(k, v);
    }
  }

  /**
   * An independent copy of every key currently set - a later `.set()` on either the original or the
   * clone never touches the other. For branch-session cloning (`runBranchRegression`): each explored
   * branch gets its own mem, so one branch's writes can't bleed into a sibling that also gets tried
   * from the same snapshot point. Shallow per value (same as `set()` always was - MemPage never
   * owned deep-copying the values themselves, only which keys point to which).
   */
  clone(): MemPage {
    const copy = new MemPage();
    for (const [k, v] of this.store) {
      copy.store.set(k, v);
    }
    return copy;
  }
}
