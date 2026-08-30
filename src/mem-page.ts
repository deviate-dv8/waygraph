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

/**
 * Builds a MemKey for a single typed value - the `T` you give here is what
 * `mem.get`/`mem.set` enforce everywhere this key is used.
 * @example const Username = key<string>("saucedemo.username");
 */
export function key<T>(name: string): MemKey<T> {
  return new MemKey<T>(name);
}

/**
 * A named shorthand for a single MemKey holding a whole shaped value (a
 * credentials object, not two separate primitive keys). `LoginCreds({ username,
 * password })` returns a `[key, value]` pair ready for `setAll`; `LoginCreds.key`
 * is the underlying MemKey, for `mem.get(LoginCreds.key)` or `Block.requires`.
 * `T` is given explicitly at the `keyGroup<T>(...)` call site, not inferred from
 * how it's later called, so this doesn't carry the same inference risk `setAll`'s
 * first attempt did.
 */
export function keyGroup<T>(name: string): ((value: T) => readonly [MemKey<T>, T]) & { key: MemKey<T> } {
  const k = key<T>(name);
  const factory = (value: T) => [k, value] as const;
  return Object.assign(factory, { key: k });
}

/**
 * Typed, identity-keyed shared memory for one graph run. Reading a key that was
 * never written throws immediately, naming the key, instead of returning
 * `undefined` - a misuse fails loud at the read site, not silently downstream.
 */
export class MemPage {
  private readonly store = new Map<MemKey<unknown>, unknown>();

  /** `mem.set(key, value)`, or `mem.set(LoginCreds({ ... }))` with a `keyGroup` pair directly - no "All" for just one. */
  set<T>(k: MemKey<T>, value: T): void;
  set<T>(pair: readonly [MemKey<T>, T]): void;
  set<T>(kOrPair: MemKey<T> | readonly [MemKey<T>, T], value?: T): void {
    const [k, v] = kOrPair instanceof MemKey ? [kOrPair, value as T] : kOrPair;
    this.store.set(k as MemKey<unknown>, v);
  }

  /**
   * Reads `k`'s value, throwing (naming `k`) if it was never `set` - never
   * returns `undefined` for a genuinely missing key, so a misuse fails loud at
   * the read site instead of surfacing as a confusing error deep in `act`.
   * @example const { username, password } = mem.get(LoginCreds.key);
   */
  get<T>(k: MemKey<T>): T {
    if (!this.store.has(k as MemKey<unknown>)) {
      throw new Error(`MemPage: "${k.name}" read before it was set`);
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
   * Sets several keys in one call - `mem.setAll([UsernameKey, "standard_user"], [PasswordKey, "secret_sauce"])`
   * instead of one `.set()` per line. Can't take a plain `{ ... }` object literal:
   * MemKey instances are the identity the store is keyed by, and object literals
   * can only have string/symbol property names, not object instances - a `[key,
   * value]` pair is the shape that keeps that identity-based guarantee.
   *
   * Overloaded per pair count (2-6, same reasoning as `Engine.defineFlow`'s
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
}
