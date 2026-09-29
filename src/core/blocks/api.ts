// New Block kind: a backend/API check, not a page action - proves a Flow can mix a UI step
// (defineNavBlock/defineMethodBlock) with a real HTTP request in the SAME state machine, verified
// by the same Trait system everything else uses. Built on Playwright's own `page.request`
// (APIRequestContext) - no shell-out to curl, no second HTTP client to depend on.
import type { Checkpoint, DefinedBlock } from "../../types.js";
import type { Trait } from "../../trait.js";
import { defineBlock } from "../block.js";
import { MemPage, key } from "../../mem-page.js";
import type { MemKey } from "../../mem-page.js";
import type { APIRequestContext, APIResponse } from "@playwright/test";

/** What `resolve`/`verify` see: the response's status and parsed body, nothing Playwright-specific. */
export interface ApiCallResult {
  status: number;
  ok: boolean;
  /** `response.json()` if the body parses as JSON, else the raw text (or `undefined` if neither). */
  body: unknown;
}

export interface ApiBlockOptions<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  name: string;
  description?: string;
  /**
   * Make the request - `request` is Playwright's own `page.request` (same cookies/origin as the
   * browser context, so an authenticated UI session carries over to the API call for free).
   * @example call: ({ request }) => request.get("/api/orders/1")
   */
  call: (ctx: { request: APIRequestContext; mem: MemPage }) => Promise<APIResponse>;
  /** Pure, like every other Block's resolve - classifies the response into a Checkpoint tag. */
  resolve: (result: ApiCallResult) => Out;
  verify?: Trait[] | ((out: Out) => Trait[]);
  requires?: readonly MemKey<any>[];
  stubBefore?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubAfter?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
  stubOnError?: import("../../highlights.js").HighlightStubPhaseOrFn<Out>;
}

// Internal scratch key threading act()'s result to observe()/resolve() - Instruction has no other
// channel for this (resolve is pure, given only what observe returns). Identity-keyed, so this can
// never collide with a real author's own MemKey even if names happened to match; safe to share one
// instance across every ApiBlock since runGraph runs act->observe->resolve fully serially per Block.
const API_RESULT_SCRATCH = key<ApiCallResult>("__wgApiBlockResult");

/**
 * A Block whose `act()` is a real HTTP request, not a page interaction - lets one Flow narrate a
 * UI step (`.gotoPage()`) and a backend check (`.method(checkOrderCreated)`) as the same state
 * machine, checked by the same Trait/verify system. Runs through `page.request`, so it shares the
 * browser context's cookies/origin - no separate auth dance for an already-logged-in session.
 * @example
 * const CheckOrderCreated = defineApiBlock<LoggedIn, OrderConfirmed | OrderFailed>({
 *   name: "check-order-created",
 *   call: ({ request }) => request.get("/api/orders/latest"),
 *   resolve: (r) => (r.ok ? checkpoint("OrderConfirmed") : checkpoint("OrderFailed")),
 *   verify: [Trait.disabled],
 * });
 */
export function defineApiBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  options: ApiBlockOptions<In, Out>,
): DefinedBlock<In, Out> {
  const built = defineBlock<In, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    instruction: {
      async act(page, _input, mem) {
        const response = await options.call({ request: page.request, mem });
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(() => undefined);
        }
        mem.set(API_RESULT_SCRATCH, { status: response.status(), ok: response.ok(), body });
      },
      async observe(_page, mem) {
        return mem.get(API_RESULT_SCRATCH);
      },
      resolve: (observed) => options.resolve(observed as ApiCallResult),
      ...(options.verify !== undefined ? { verify: options.verify } : {}),
      ...(options.stubBefore !== undefined ? { stubBefore: options.stubBefore } : {}),
      ...(options.stubAfter !== undefined ? { stubAfter: options.stubAfter } : {}),
      ...(options.stubOnError !== undefined ? { stubOnError: options.stubOnError } : {}),
    },
  }) as DefinedBlock<In, Out>;
  Object.defineProperty(built, "__waygraphKind", { value: "api", enumerable: false, configurable: false });
  return built;
}
