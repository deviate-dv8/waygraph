// New Block kind: a backend/API check, not a page action - proves a Flow can mix a UI step
// (defineNavBlock/defineMethodBlock) with a real HTTP request in the SAME state machine, verified
// by the same Trait system everything else uses. Built on Playwright's own `page.request`
// (APIRequestContext) - no shell-out to curl, no second HTTP client to depend on.
import { recordApiCall } from "../../run/hooks.js";
import { checkpoint } from "../../checkpoint/checkpoint.js";
import { markRouteOf, tagsOf } from "../../checkpoint/route.js";
import type { Checkpoint } from "../../checkpoint/checkpoint.js";
import type { DefinedBlock } from "../block.js";
import type { Trait } from "../../trait/trait.js";
import { defineBlock } from "../block.js";
import { MemPage, key } from "../../mem/mem.js";
import type { MemKey } from "../../mem/mem.js";
import type { APIRequestContext, APIResponse } from "@playwright/test";
import { ignorePageGone } from "../../page-gone.js";

/** What `resolve`/`verify` see: the response's status and parsed body, nothing Playwright-specific. */
export interface ApiCallResult {
  status: number;
  ok: boolean;
  /** `response.json()` if the body parses as JSON, else the raw text (or `undefined` if neither). */
  body: unknown;
}

/** Options for `defineApiBlock`: the HTTP call, how its result maps to a Checkpoint, and the demo network panel. */
export interface ApiBlockOptions<In extends Checkpoint<string>, Out extends Checkpoint<string>> {
  name: string;
  description?: string;
  /**
   * Make the request - `request` is Playwright's own `page.request` (same cookies/origin as the
   * browser context, so an authenticated UI session carries over to the API call for free).
   * @example call: ({ request }) => request.get("/api/orders/1")
   */
  call: (ctx: { request: APIRequestContext; mem: MemPage }) => Promise<APIResponse>;
  /**
   * HTTP method shown in the network-tab overlay (GET/POST/PATCH/...) - `APIResponse` (unlike a
   * page's own `Response`) carries no back-reference to the request that produced it, so this
   * can't be read back automatically; defaults to "GET" if omitted. Purely cosmetic - never
   * affects the actual request `call` makes.
   * @example method: "POST"
   */
  method?: string;
  /** Where it runs: one Checkpoint value or a list; leave it out for "from anywhere". */
  from?: In | readonly In[];
  /** Where it lands: one Checkpoint value (then `resolve` may be left out) or a list. */
  to: Out | readonly Out[];
  /** Pure, like every other Block's resolve - picks the Checkpoint from the response. Optional when `to` is one Checkpoint. */
  resolve?: (result: ApiCallResult) => Out;
  verify?: Trait[] | ((out: Out) => Trait[]);
  requires?: readonly MemKey<unknown>[];
  stubBefore?: import("../../narration.js").HighlightStubPhaseOrFn<Out>;
  stubAfter?: import("../../narration.js").HighlightStubPhaseOrFn<Out>;
  stubOnError?: import("../../narration.js").HighlightStubPhaseOrFn<Out>;
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
 * const CheckOrderCreated = defineApiBlock({
 *   name: "check-order-created",
 *   from: LoggedIn,
 *   to: [OrderConfirmed, OrderFailed],
 *   call: ({ request }) => request.get("/api/orders/latest"),
 *   resolve: (r) => (r.ok ? OrderConfirmed : OrderFailed),
 *   verify: [Trait.disabled],
 * });
 */
export function defineApiBlock<In extends Checkpoint<string>, Out extends Checkpoint<string>>(
  options: ApiBlockOptions<In, Out>,
): DefinedBlock<In, Out> {
  const targets = tagsOf(options.to);
  const pick = options.resolve;
  if (!pick && targets.length !== 1) {
    throw new Error(`waygraph: API Block "${options.name}" lands on several Checkpoints; give it a resolve() that picks one`);
  }
  const resolve = pick ?? ((): Out => checkpoint(targets[0]!) as Out);
  const built = defineBlock<In, Out>({
    name: options.name,
    ...(options.description ? { description: options.description } : {}),
    ...(options.requires ? { requires: options.requires } : {}),
    instruction: {
      async act(page, _input, mem) {
        const startedAt = Date.now();
        const response = await options.call({ request: page.request, mem });
        const ms = Date.now() - startedAt;
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = await response.text().catch(ignorePageGone);
        }
        mem.set(API_RESULT_SCRATCH, { status: response.status(), ok: response.ok(), body });
        // Shown in the demo's network panel when a demo layer registered a recorder; never fails the Block.
        try {
          await recordApiCall(page, {
            method: options.method || "GET",
            url: response.url(),
            status: response.status(),
            ok: response.ok(),
            ms,
            resHeaders: response.headers(),
            resBody: typeof body === "string" ? body : body !== undefined ? JSON.stringify(body) : undefined,
          });
        } catch {
          /* overlay not installed / page already closed - not this Block's job to report that */
        }
      },
      async observe(_page, mem) {
        return mem.get(API_RESULT_SCRATCH);
      },
      resolve: (observed) => resolve(observed as ApiCallResult),
      ...(options.verify !== undefined ? { verify: options.verify } : {}),
      ...(options.stubBefore !== undefined ? { stubBefore: options.stubBefore } : {}),
      ...(options.stubAfter !== undefined ? { stubAfter: options.stubAfter } : {}),
      ...(options.stubOnError !== undefined ? { stubOnError: options.stubOnError } : {}),
    },
  }) as DefinedBlock<In, Out>;
  markRouteOf(built, options);
  Object.defineProperty(built, "__waygraphKind", { value: "api", enumerable: false, configurable: false });
  // Accepted by map().method(), like a Method: one step that lands on a Checkpoint.
  Object.defineProperty(built, "__waygraphSalt", { value: "api", enumerable: false, configurable: false });
  return built;
}
