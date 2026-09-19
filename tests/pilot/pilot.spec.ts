import { test, expect } from "@playwright/test";
import { join } from "node:path";
// Imported from dist/, not src/: AutoSession dynamically imports the real
// examples/saucedemo Blocks, which resolve "waygraph" via node_modules (a
// symlink to this package's own dist/ build) - importing this test's own
// AutoSession/MemKey-touching code from src/ instead would create two
// different MemKey classes at runtime (a real dual-module-instance problem,
// not a bug in AutoSession itself), the same reason
// tests/fixtures/inline-selector-check/ already imports from dist/.
import { AutoSession, resolveAsk, pilotNarrate, pilotAct } from "../../dist/index.js";
import type { SessionSnapshot } from "../../dist/index.js";

const sauceRoot = join(import.meta.dirname, "../../examples/saucedemo");

test.describe("resolveAsk (pure - no browser)", () => {
  const snapshot: SessionSnapshot = {
    here: "LoggedIn",
    lastRunNote: null,
    done: false,
    sections: [
      {
        title: "Methods from LoggedIn",
        edges: [
          { index: 1, block: "add-to-cart", kind: "action", to: "ItemInCart", description: "Adds the selected item to the cart." },
          { index: 2, block: "submit-logout", kind: "action", to: "LoginPage", description: "Signs the current user out." },
        ],
      },
      {
        title: "Navigate",
        edges: [
          { index: 3, block: "nav-cart", kind: "nav", to: "CartPage", description: "Goes to the shopping cart page." },
        ],
      },
    ],
  };

  test("an ask closely matching one reachable edge's description resolves to it", () => {
    const resolved = resolveAsk(snapshot, "how do I add an item to my cart");
    expect(resolved?.edge.block).toBe("add-to-cart");
  });

  test("a different ask resolves to a different edge", () => {
    const resolved = resolveAsk(snapshot, "I want to sign out");
    expect(resolved?.edge.block).toBe("submit-logout");
  });

  test("a well-matching but unreachable edge is never returned", () => {
    // "checkout" doesn't appear in any reachable edge's description here -
    // confirms the resolver only ever scores what's actually in the snapshot,
    // not some other part of the graph it might otherwise know about.
    const resolved = resolveAsk(snapshot, "I want to checkout and pay now");
    expect(resolved?.edge.block).not.toBe("checkout");
  });

  test("no confident match returns null, not a weak guess", () => {
    const resolved = resolveAsk(snapshot, "xyzzy plugh qux");
    expect(resolved).toBeNull();
  });

  test("an edge with no description can never be matched", () => {
    const noDescSnapshot: SessionSnapshot = {
      here: "LoggedIn",
      lastRunNote: null,
      done: false,
      sections: [{ title: "x", edges: [{ index: 1, block: "mystery", kind: "action", to: "Y" }] }],
    };
    const resolved = resolveAsk(noDescSnapshot, "mystery action");
    expect(resolved).toBeNull();
  });
});

test.describe("pilotNarrate / pilotAct (real AutoSession, real saucedemo.com)", () => {
  // saucedemo's own root URL IS the login page - a fresh session lands
  // directly on LoginPage (here is never null here), so "fill in my
  // username" (not "go to the login page") is the first real reachable ask.
  test("resolves a real ask, narrates it without acting, then acts on a second real ask", async ({}) => {
    test.setTimeout(60_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      const atLogin = await session.currentSnapshot();
      expect(atLogin.here).toBe("LoginPage");

      const fillUsernameAsk = resolveAsk(atLogin, "fill in my username");
      expect(fillUsernameAsk?.edge.block).toBe("fill-username");

      const narrated = await pilotNarrate(session, fillUsernameAsk!);
      expect(narrated.selector).toBeTruthy();

      // Narrate must not have run the Block: state unchanged, and the real
      // input field is still empty.
      const stillAtLogin = await session.currentSnapshot();
      expect(stillAtLogin.here).toBe("LoginPage");
      const page = await session.getPage();
      expect(await page.locator(narrated.selector).inputValue()).toBe("");

      // The ring is actually visible on the real page.
      const ringVisible = await page.locator("#wg-pilot-ring.wg-pilot-visible").isVisible();
      expect(ringVisible).toBe(true);

      // Now actually act on that same resolved ask - runs the real Block.
      const filledResult = await pilotAct(session, fillUsernameAsk!);
      expect(filledResult.ok).toBe(true);
      expect(await page.locator(narrated.selector).inputValue()).toBe("standard_user");

      // A second real ask, resolved fresh against the post-act snapshot.
      const afterFillUsername = await session.currentSnapshot();
      const fillPasswordAsk = resolveAsk(afterFillUsername, "fill in my password");
      expect(fillPasswordAsk?.edge.block).toBe("fill-password");
      const passwordResult = await pilotAct(session, fillPasswordAsk!);
      expect(passwordResult.ok).toBe(true);

      const afterFillPassword = await session.currentSnapshot();
      const submitAsk = resolveAsk(afterFillPassword, "submit the login form and sign in");
      expect(submitAsk?.edge.block).toBe("submit-login");
      const submitResult = await pilotAct(session, submitAsk!);
      expect(submitResult.ok).toBe(true);
      if (submitResult.ok) expect(submitResult.snapshot.here).toBe("LoggedIn");
    } finally {
      await session.close();
    }
  });

  test("pilotAct's outcome matches a manual applyPick of the same edge", async () => {
    test.setTimeout(60_000);
    const session1 = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    const snapshot1 = await session1.currentSnapshot();
    const resolved1 = resolveAsk(snapshot1, "fill in my username");
    expect(resolved1).not.toBeNull();
    const viaApplyPick = await session1.applyPick(String(resolved1!.edge.index));
    await session1.close();

    const session2 = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    const snapshot2 = await session2.currentSnapshot();
    const resolved2 = resolveAsk(snapshot2, "fill in my username");
    const viaPilotAct = await pilotAct(session2, resolved2!);
    await session2.close();

    expect(viaPilotAct.ok).toBe(viaApplyPick.ok);
    if (viaPilotAct.ok && viaApplyPick.ok) {
      expect(viaPilotAct.snapshot.here).toEqual(viaApplyPick.snapshot.here);
    }
  });

  test("a resolved edge whose Block has no stubBefore highlight data fails loud, not silently", async () => {
    test.setTimeout(60_000);
    const session = await AutoSession.start({ projectDir: sauceRoot, headless: true });
    try {
      // Log in for real via three real pilotAct calls, then resolve
      // "log out" - submit-logout has no stubBefore authored on it in this
      // example, unlike every Block on the login path itself.
      let snapshot = await session.currentSnapshot();
      await pilotAct(session, resolveAsk(snapshot, "fill in my username")!);
      snapshot = await session.currentSnapshot();
      await pilotAct(session, resolveAsk(snapshot, "fill in my password")!);
      snapshot = await session.currentSnapshot();
      const submitResult = await pilotAct(session, resolveAsk(snapshot, "submit the login form")!);
      expect(submitResult.ok).toBe(true);

      const loggedInSnapshot = await session.currentSnapshot();
      expect(loggedInSnapshot.here).toBe("LoggedIn");
      const logoutAsk = resolveAsk(loggedInSnapshot, "log me out of my account");
      expect(logoutAsk?.edge.block).toBe("submit-logout");

      await expect(pilotNarrate(session, logoutAsk!)).rejects.toThrow(/no stubBefore highlight data to narrate/);
    } finally {
      await session.close();
    }
  });
});
