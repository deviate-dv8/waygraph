// `Page.check(description, (read, mem) => boolean)`: the one primitive for a check the page's keys can't say by themselves
// (`Key.is(want)` is the common case of it). It gets everything the page shows, as one typed object, and says true or false.
import type { MemPage } from "../mem/mem.js";
import type { Trait } from "../trait/trait.js";
import { readNamespaceNow } from "./read-block.js";

/** What a check says: pass or fail, or `{ ok, saw }` to say what the page showed when it fails. */
export type CheckResult = boolean | { ok: boolean; saw?: string };

/** The `check` of a page whose read is in `namespace`. */
export function checkOf<V>(namespace: string): (description: string, test: (read: V, mem: MemPage) => CheckResult) => Trait {
  return (description, test) => ({
    name: `check(${description})`,
    wants: description,
    says: description,
    async check(page, mem) {
      const { read } = await readNamespaceNow(page, mem, namespace);
      if (!read) return { ok: false, saw: `nothing to read for ${namespace} (is there a read for it, and does the page show it?)` };
      const shown = (read.toJSON()[namespace] ?? {}) as V;
      const result = test(shown, mem);
      const saw = JSON.stringify(shown);
      const brief = saw.length > 120 ? `${saw.slice(0, 117)}...` : saw;
      return typeof result === "boolean" ? { ok: result, saw: brief } : { ok: result.ok, saw: result.saw ?? brief };
    },
  });
}
