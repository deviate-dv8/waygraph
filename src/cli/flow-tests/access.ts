// The access tests (`waygraph test --flows`, beside the flows): one per account, when the project says who's given what
// (`for`). Signed in as the account, each layout shows exactly the links it's given, and each page it isn't given
// doesn't open.
import { test, type BrowserContext, type Page } from "@playwright/test";
import { givenTo } from "../../engine/block/access.js";
import { layoutState, linkShowing, type Layout } from "../../engine/block/kinds/layout.js";
import type { LayoutLink } from "../../engine/block/kinds/layout.js";
import type { PageMethodEntry } from "../../engine/block/kinds/page.js";
import type { SomeBlock } from "../../engine/block/some-block.js";
import { allAccounts, accountKeys, signInStep, type Account } from "../../engine/flow/account.js";
import { buildFlow } from "../../engine/flow/flow.js";
import { MemPage } from "../../engine/mem/mem.js";
import { ignoreTimeout } from "../../engine/page-gone.js";
import { messageOf } from "../../engine/errors.js";
import { scanProject, type ScannedBlock } from "../../manifest/project.js";

/** How long a check waits for something on the page here. */
const WAIT_MS = 10_000;

type AnyLayout = Layout<Record<string, LayoutLink>, Record<string, PageMethodEntry>>;

interface Marked {
  __waygraphKind?: string;
  __waygraphTo?: readonly string[];
  __waygraphNavClick?: unknown;
  __waygraphLayout?: unknown;
}

/** The Block that opens `page` by its address with what `acc` brings: a url Nav or Page Block that needs nothing else. */
function opener(blocks: readonly ScannedBlock[], page: string, acc: Account): SomeBlock | undefined {
  const own = new Set(accountKeys(acc).map((k) => k.name));
  return blocks.find(({ block }) => {
    const m = block as Marked;
    const byUrl = (m.__waygraphKind === "nav" || m.__waygraphKind === "page") && m.__waygraphNavClick === undefined && !m.__waygraphLayout;
    return byUrl && (m.__waygraphTo ?? []).includes(page) && (block.requires ?? []).every((k) => own.has(k.name));
  })?.block as SomeBlock | undefined;
}

/** Whether `acc` is given what `given` names (every account, without it). */
const isGiven = (given: readonly string[] | undefined, acc: Account) => !given || given.includes(acc.name);

/** Signs in as `acc` and opens `page` with `open`: the page it landed on, or the error that stopped it. */
async function openAs(acc: Account, open: SomeBlock, context: BrowserContext, page: Page): Promise<Error | undefined> {
  try {
    await buildFlow([signInStep(acc), open], acc.signIn.config).run(context, new MemPage(), { page });
    return undefined;
  } catch (err) {
    return err as Error;
  }
}

/** What's wrong with `layout`'s links on the page, as `acc`: each one shown it isn't given, or given and not shown. */
async function checkLinks(layout: AnyLayout, acc: Account, page: Page): Promise<string[]> {
  const links = Object.entries(layout.go).flatMap(([key, nav]) => {
    const click = (nav as Marked).__waygraphNavClick;
    return typeof click === "string" ? [{ key, selector: click, given: isGiven(givenTo(nav), acc) }] : [];
  });
  const showingNow = async () => Promise.all(links.map((l) => linkShowing(page, l.selector)));
  let shown = await showingNow();
  // A menu that hides its links: opened, when a link it's given isn't showing yet.
  if (layout.opens && links.some((l, i) => l.given && !shown[i])) {
    await page.locator(layout.opens).click();
    const first = links.find((l) => l.given);
    if (first) await page.locator(first.selector).first().waitFor({ state: "visible", timeout: WAIT_MS / 2 }).catch(ignoreTimeout);
    shown = await showingNow();
  }
  return links.flatMap((l, i) =>
    l.given && !shown[i]
      ? [`${layout.name} › ${l.key} isn't showing, and ${acc.name} is given it (${l.selector})`]
      : !l.given && shown[i]
        ? [`${layout.name} › ${l.key} shows, and ${acc.name} isn't given it (${l.selector}): add ${acc.name} to its for, or hide it`]
        : [],
  );
}

/** Registers one access test per account, when anything in the project says who it's for. */
export async function registerAccessTests(projectDir: string): Promise<void> {
  const scan = await scanProject(projectDir, { flows: false, maps: false });
  const layouts = scan.layouts.map((l) => l.layout as AnyLayout);
  const forbidding = scan.blocks.filter(({ block }) => (block as Marked).__waygraphKind === "page" && givenTo(block));
  const saysWho = forbidding.length > 0 || scan.blocks.some(({ block }) => givenTo(block)) || layouts.some((l) => Object.values(l.access).some(Boolean));
  if (!saysWho) return;
  /** Who can open the page `tag`, when its Page Block says. */
  const pageGiven = (tag: string) => {
    const hub = forbidding.find(({ block }) => (block as Marked).__waygraphTo?.includes(tag));
    return hub ? givenTo(hub.block) : undefined;
  };
  for (const acc of allAccounts()) {
    test(`access › ${acc.name}`, { tag: ["@access", `@${acc.name}`] }, async ({ page, context }) => {
      // A page that doesn't open, or a link that isn't there, is waited for a while, not for the whole test: each page
      // tried gets its own time.
      page.setDefaultTimeout(WAIT_MS);
      test.setTimeout(test.info().timeout + 2 * WAIT_MS * (layouts.length + forbidding.length));
      try {
        await buildFlow([signInStep(acc)], acc.signIn.config).run(context, new MemPage(), { page });
      } catch (err) {
        test.skip(true, `${acc.name} can't sign in: ${messageOf(err)}`);
      }
      const problems: string[] = [];
      for (const layout of layouts) {
        const covers = layoutState(layout.name).covers;
        // A page of the layout the account can open, by its address.
        const visit = covers.map((tag) => ({ tag, open: opener(scan.blocks, tag, acc) })).find((v) => v.open && isGiven(pageGiven(v.tag), acc));
        if (!visit?.open) {
          test.info().annotations.push({ type: "not checked", description: `${layout.name}: none of its pages opens by address for ${acc.name}` });
          continue;
        }
        const failed = await openAs(acc, visit.open, context, page);
        if (failed) {
          problems.push(`${layout.name}: ${visit.tag} didn't open for ${acc.name}: ${messageOf(failed)}`);
          continue;
        }
        problems.push(...(await checkLinks(layout, acc, page)));
      }
      for (const { block } of forbidding) {
        if (isGiven(givenTo(block), acc)) continue;
        const tag = (block as Marked).__waygraphTo?.[0];
        const open = tag ? opener(scan.blocks, tag, acc) : undefined;
        if (!tag || !open) continue;
        if (!(await openAs(acc, open, context, page))) problems.push(`${tag} opened for ${acc.name}, who isn't given it (for: ${givenTo(block)?.join(", ")})`);
      }
      if (problems.length) throw new Error(`access as ${acc.name}:\n  ${problems.join("\n  ")}`);
    });
  }
}
