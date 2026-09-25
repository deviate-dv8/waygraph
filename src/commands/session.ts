// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { printBrowserSessionsList, printBrowserUsage } from "../cli/usage.js";
import { applyRunFlags, looksLikeFlowFileRef, parseRunFlags, resolveBaseUrl } from "../cli/flags.js";
import { runChain } from "../cli/run-chain.js";
import { runChainAuto } from "./check.js";
import { resolve } from "node:path";
import { browserStart, listBrowserSessions, stopAllBrowserSessions, stopBrowserSession } from "../browser.js";
import { existsSync, statSync } from "node:fs";
import { resolveInjectRoots } from "../block-inject.js";
import { requestSession, resolveSessionMeta, runAttachLoop, runAutoServeCommand, spawnDetachedSession } from "../auto-session-ipc.js";
import { pilotAttach, pilotStart } from "../pilot.js";
import { parseHighlightShorthand } from "../highlight-shorthand.js";
import { isFileSelectToken, parseBlocksSelect } from "../blocks-select.js";
import { runAutoExplore } from "../auto-explore-run.js";
import { discoverGraph, findOrphanBlocks, toMermaid } from "../graph.js";

export async function sessionCase(args: string[], command: string | undefined): Promise<void> {
      if (command === "browser") {
        const sub = args[1];
        if (sub === "sessions") {
          const rest = args.slice(2);
          const json = rest.includes("--json");
          const positional = rest.filter((a) => a !== "--json");
          const proj = resolve(positional[0] ?? process.cwd());
          const sessions = listBrowserSessions(proj);
          if (json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            printBrowserSessionsList(sessions, proj);
          }
          return;
        }
        if (sub === "stop") {
          const proj = resolve(args[3] ?? process.cwd());
          const target = args[2];
          if (!target) {
            console.error("waygraph browser stop: usage: waygraph browser stop <sessionId|--all> [project]");
            process.exit(1);
          }
          if (target === "--all") {
            const n = stopAllBrowserSessions(proj);
            console.log(JSON.stringify({ stopped: n, projectDir: proj }));
            return;
          }
          if (!stopBrowserSession(proj, target)) {
            console.error(`waygraph browser stop: no such session "${target}"`);
            process.exit(1);
          }
          console.log(JSON.stringify({ stopped: target }));
          return;
        }
        if (!sub) {
          printBrowserUsage();
          return;
        }
        if (sub === "start" || sub.startsWith("-")) {
          const flagArgs = sub === "start" ? args.slice(2) : args.slice(1);
          const flags = parseRunFlags(flagArgs);
          applyRunFlags(flags);
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          if (!existsSync(proj)) {
            console.error(`waygraph browser: no such directory: ${proj}`);
            process.exit(1);
          }
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          try {
            const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
            const result = await browserStart({
              projectDir: proj,
              ...(inject?.length ? { inject } : {}),
              ...(baseURL ? { baseURL } : {}),
              ...(flags.goto
                ? { startUrl: flags.goto, skipInitialNavigation: false }
                : { skipInitialNavigation: flags.blank !== false }),
              headless: flags.headlessBrowser === true,
            });
            console.log(JSON.stringify(result));
            if (!result.headless) {
              console.error(`Session ${result.sessionId} started. List all: waygraph browser sessions`);
            }
            if (flags.cli) {
              await runAttachLoop(proj, result.sessionId);
            }
          } catch (err) {
            console.error(`waygraph browser start: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          return;
        }
        if (
          sub !== "send" &&
          sub !== "status" &&
          sub !== "attach" &&
          sub !== "dom" &&
          sub !== "trace" &&
          sub !== "console" &&
          sub !== "storage" &&
          sub !== "upload" &&
          sub !== "click" &&
          sub !== "type" &&
          sub !== "press" &&
          sub !== "goto" &&
          sub !== "reload" &&
          sub !== "reach" &&
          sub !== "resync" &&
          sub !== "highlight"
        ) {
          console.error("waygraph browser: unknown subcommand — run `waygraph browser` for usage");
          printBrowserUsage();
          process.exit(1);
        }
      }

      if (command === "pilot") {
        if (args[1] === "sessions") {
          const rest = args.slice(2);
          const json = rest.includes("--json");
          const positional = rest.filter((a) => a !== "--json");
          const proj = resolve(positional[0] ?? process.cwd());
          const sessions = listBrowserSessions(proj);
          if (json) {
            console.log(JSON.stringify(sessions, null, 2));
          } else {
            printBrowserSessionsList(sessions, proj);
          }
          return;
        }
        if (args[1] === "attach") {
          const sessionId = args[2];
          if (!sessionId) {
            console.error("waygraph pilot attach: usage: waygraph pilot attach <sessionId> [--inject …] [project]");
            process.exit(1);
          }
          const flags = parseRunFlags(args.slice(3));
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          try {
            const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
            const result = await pilotAttach(proj, sessionId, inject);
            console.log(JSON.stringify(result));
          } catch (err) {
            console.error(`waygraph pilot attach: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          return;
        }
        if (args[1] === "start" || !args[1] || args[1].startsWith("-")) {
          const flagArgs = args[1] === "start" ? args.slice(2) : args.slice(1);
          const flags = parseRunFlags(flagArgs);
          applyRunFlags(flags);
          const proj = resolve(flags.positionals[0] ?? process.cwd());
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          try {
            const result = await pilotStart({
              projectDir: proj,
              ...(flags.inject?.length ? { injectTokens: flags.inject } : {}),
              ...(baseURL ? { baseURL } : {}),
              ...(flags.goto
                ? { startUrl: flags.goto, skipInitialNavigation: false }
                : flags.blank === true
                  ? { skipInitialNavigation: true }
                  : {}),
              headless: flags.headlessBrowser === true,
            });
            console.log(JSON.stringify(result));
            if (!result.headless) {
              console.error(
                `Chromium window opened (session ${result.sessionId}). ` +
                  `Terminal menu: waygraph pilot attach ${result.sessionId}`,
              );
            }
            if (flags.cli) {
              await runAttachLoop(proj, result.sessionId);
            }
          } catch (err) {
            console.error(`waygraph pilot start: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
          }
          return;
        }
        if (
          args[1] !== "send" &&
          args[1] !== "status" &&
          args[1] !== "dom" &&
          args[1] !== "trace" &&
          args[1] !== "console" &&
          args[1] !== "storage" &&
          args[1] !== "upload" &&
          args[1] !== "click" &&
          args[1] !== "type" &&
          args[1] !== "press" &&
          args[1] !== "goto" &&
          args[1] !== "reload" &&
          args[1] !== "reach" &&
          args[1] !== "resync" &&
          args[1] !== "highlight"
        ) {
          console.error(
            "waygraph pilot: usage:\n" +
              "  waygraph pilot start [--inject …] [--goto <url>] [--headless] [--cli] [--base-url <url>] [project]\n" +
              "  waygraph pilot sessions [project]   # list live browser sessions\n" +
              "  waygraph pilot attach <sessionId>   # graph + snapshot for an existing session\n" +
              "  waygraph pilot send|status|attach|highlight|… <sessionId> …  (controls browser — same as browser/auto)",
          );
          process.exit(1);
        }
      }

      // auto send|status|attach <sessionId> - session control against a
      // --detach'd background session. Intercepted before the normal
      // project-directory resolution below, same pattern `try demo|auto|
      // auto:cli` already uses for a sub-verb positional.
      if (
        (command === "auto" || command === "browser" || command === "pilot") &&
        (args[1] === "send" ||
          args[1] === "status" ||
          (args[1] === "attach" && command !== "pilot") ||
          args[1] === "dom" ||
          args[1] === "trace" ||
          args[1] === "console" ||
          args[1] === "storage" ||
          args[1] === "upload" ||
          args[1] === "click" ||
          args[1] === "type" ||
          args[1] === "press" ||
          args[1] === "goto" ||
          args[1] === "reload" ||
          args[1] === "reach" ||
          args[1] === "resync" ||
          args[1] === "highlight")
      ) {
        const sub = args[1];
        const sessionId = args[2];
        if (!sessionId) {
          console.error(`waygraph ${command} ${sub}: missing <sessionId>`);
          process.exit(1);
        }
        const projHint = resolve(process.cwd());
        const meta = resolveSessionMeta(sessionId, projHint);
        if (!meta) {
          console.error(
            `waygraph ${command} ${sub}: no such session "${sessionId}" — ` +
              "wrong directory? run `waygraph pilot sessions` from the project that started it",
          );
          process.exit(1);
        }
        const proj = meta.projectDir;
        if (sub === "attach") {
          await runAttachLoop(proj, sessionId);
          return;
        }
        if (sub === "send") {
          const pick = args[3];
          if (pick === undefined) {
            console.error('waygraph auto send: usage: waygraph auto send <sessionId> "<pick>" [--timeout <ms>]');
            process.exit(1);
          }
          // Real, direct need found live: a single Block can legitimately
          // run a genuinely slow real interaction (e.g. a multi-step mouse
          // drag) that exceeds the 15s default - same reasoning `auto
          // reach` already gets a 90s default for (multiple Blocks in one
          // call). Unlike reach, send has no way to know ahead of time
          // whether the ONE Block it's running is fast or slow, so this is
          // opt-in via a flag rather than a raised default.
          let timeoutMs: number | undefined;
          for (let i = 4; i < args.length; i++) {
            if (args[i] === "--timeout") {
              const raw = args[++i];
              const n = Number(raw);
              if (!Number.isFinite(n) || n <= 0) {
                console.error(`waygraph auto send: --timeout must be a positive number of ms, got "${raw}"`);
                process.exit(1);
              }
              timeoutMs = n;
            }
          }
          const res = await requestSession(proj, sessionId, { op: "send", pick }, timeoutMs);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "dom") {
          const domArgs = args.slice(3);
          let mode: "aria" | "full" | undefined;
          let selector: string | undefined;
          let depth: number | undefined;
          for (let i = 0; i < domArgs.length; i++) {
            const a = domArgs[i]!;
            if (a === "--mode" || a.startsWith("--mode=")) {
              const v = a.startsWith("--mode=") ? a.slice("--mode=".length) : domArgs[++i];
              if (v !== "aria" && v !== "full") {
                console.error(`waygraph auto dom: --mode must be "aria" or "full", got "${v}"`);
                process.exit(1);
              }
              mode = v;
            } else if (a === "--selector" || a.startsWith("--selector=")) {
              selector = a.startsWith("--selector=") ? a.slice("--selector=".length) : domArgs[++i];
            } else if (a === "--depth" || a.startsWith("--depth=")) {
              const raw = a.startsWith("--depth=") ? a.slice("--depth=".length) : domArgs[++i];
              const n = Number(raw);
              if (!Number.isInteger(n) || n < 1) {
                console.error(`waygraph auto dom: --depth must be a positive integer, got "${raw}"`);
                process.exit(1);
              }
              depth = n;
            } else {
              console.error(`waygraph auto dom: unrecognized argument "${a}"`);
              process.exit(1);
            }
          }
          const res = await requestSession(proj, sessionId, {
            op: "dom",
            ...(mode ? { mode } : {}),
            ...(selector ? { selector } : {}),
            ...(depth !== undefined ? { depth } : {}),
          });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "trace") {
          const res = await requestSession(proj, sessionId, { op: "trace" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "console") {
          const res = await requestSession(proj, sessionId, { op: "console" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "storage") {
          const res = await requestSession(proj, sessionId, { op: "storage" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "click") {
          const selector = args[3];
          if (selector === undefined) {
            console.error('waygraph auto click: usage: waygraph auto click <sessionId> "<selector>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "click", selector });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "type") {
          const selector = args[3];
          const text = args[4];
          if (selector === undefined || text === undefined) {
            console.error('waygraph auto type: usage: waygraph auto type <sessionId> "<selector>" "<text>"');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "type", selector, text });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "press") {
          const selector = args[3];
          const key = args[4];
          if (selector === undefined || key === undefined) {
            console.error('waygraph auto press: usage: waygraph auto press <sessionId> "<selector>" <key>');
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "press", selector, key });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "goto") {
          const url = args[3];
          if (url === undefined) {
            console.error("waygraph auto goto: usage: waygraph auto goto <sessionId> <url>");
            process.exit(1);
          }
          const res = await requestSession(proj, sessionId, { op: "goto", url });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "upload") {
          const selector = args[3];
          const kindOrPath = args[4];
          if (selector === undefined || kindOrPath === undefined) {
            console.error(
              'waygraph auto upload: usage: waygraph auto upload <sessionId> "<selector>" <image|pdf|video|path-to-file>',
            );
            process.exit(1);
          }
          const stub: { selector: string; stub: "image" | "pdf" | "video" | { filePath: string } } =
            kindOrPath === "image" || kindOrPath === "pdf" || kindOrPath === "video"
              ? { selector, stub: kindOrPath }
              : { selector, stub: { filePath: resolve(process.cwd(), kindOrPath) } };
          const res = await requestSession(proj, sessionId, { op: "upload", ...stub });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "reload") {
          const res = await requestSession(proj, sessionId, { op: "reload" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "reach") {
          const checkpoint = args[3];
          if (checkpoint === undefined) {
            console.error("waygraph auto reach: usage: waygraph auto reach <sessionId> <Checkpoint>");
            process.exit(1);
          }
          // Longer than every other op's default (15s): a real multi-step
          // route runs several real Blocks in sequence server-side before
          // responding - a legitimately slow single request, not a hang.
          const res = await requestSession(proj, sessionId, { op: "reach", checkpoint }, 90_000);
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "resync") {
          const res = await requestSession(proj, sessionId, { op: "resync" });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        if (sub === "highlight") {
          const raw = args[3];
          if (raw === undefined) {
            console.error(
              `waygraph ${command} highlight: usage:\n` +
                `  waygraph ${command} highlight <sessionId> '{"rings":[{"selector":"#x","label":"X"}]}'\n` +
                `  waygraph ${command} highlight <sessionId> "#x|X" (shorthand: <selector>|<label>[|<tone>], rings separated by ";")`,
            );
            process.exit(1);
          }
          let fixtures: Record<string, unknown>;
          try {
            fixtures = JSON.parse(raw) as Record<string, unknown>;
          } catch (jsonErr) {
            const shorthand = parseHighlightShorthand(raw);
            if (shorthand.type === "error") {
              console.error(
                `waygraph ${command} highlight: body is neither valid JSON (${
                  jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
                }) nor valid shorthand (${shorthand.reason})`,
              );
              process.exit(1);
            }
            fixtures = shorthand.fixtures;
          }
          if (fixtures.op !== undefined && fixtures.op !== "highlight") {
            console.error(`waygraph ${command} highlight: do not set "op" (or set it to "highlight")`);
            process.exit(1);
          }
          const { op: _ignore, ...rest } = fixtures as { op?: string } & Record<string, unknown>;
          const res = await requestSession(proj, sessionId, {
            op: "highlight",
            ...(rest as import("../pilot-overlay.js").PilotHighlightFixtures),
          });
          console.log(JSON.stringify(res));
          if (!res.ok) process.exitCode = 1;
          return;
        }
        const res = await requestSession(proj, sessionId, { op: "status" });
        console.log(JSON.stringify(res));
        if (!res.ok) process.exitCode = 1;
        return;
      }

      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const mermaid = flags.mermaid === true;
      const mapOnly = command === "graph" || flags.map === true;
      const cliPicker = flags.cli === true;
      const firstPos = flags.positionals[0];

      // auto src/flows/shop.flow.ts → run that flow (same as `run`). Do not
      // treat a .flow.ts path as a project directory (existsSync is true for files).
      if (command === "auto" && firstPos && looksLikeFlowFileRef(firstPos) && !flags.blocksFromTo) {
        const proj = resolve(process.cwd());
        if (!existsSync(proj) || !statSync(proj).isDirectory()) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        if (!process.env.WAYGRAPH_BASE_URL) {
          const resolved = resolveBaseUrl(proj);
          if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
        }
        await runChain(proj, firstPos);
        return;
      }

      const proj = resolve(firstPos ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!statSync(proj).isDirectory()) {
        console.error(
          `waygraph ${command}: "${firstPos}" is a file, not a project directory\n` +
            "  run a flow:  waygraph auto src/flows/shop.flow.ts\n" +
            "  or explore:  waygraph auto\n" +
            "  or path-find: waygraph auto --blocks LoginPage OrderComplete",
        );
        process.exit(1);
      }

      // auto --cli --detach: start the explore session as a background socket
      // server instead of blocking in the interactive loop. Session control
      // only applies to --cli (spec: "Headful mode is unaffected").
      if (command === "auto" && flags.detach) {
        if (!cliPicker) {
          console.error("waygraph auto --detach requires --cli (headful has no session control)");
          process.exit(1);
        }
        const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
        try {
          const meta = await spawnDetachedSession({
            projectDir: proj,
            ...(baseURL ? { baseURL } : {}),
            ...(flags.nonHeadless ? { headless: false } : {}),
          });
          console.log(
            JSON.stringify({ sessionId: meta.sessionId, socketPath: meta.socketPath, headless: meta.headless }),
          );
        } catch (err) {
          console.error(`waygraph auto --detach: ${err instanceof Error ? err.message : String(err)}`);
          process.exit(1);
        }
        return;
      }

      // auto --blocks From To  (graph path-find + run)
      // auto --blocks '/regex/' or '**/*.block.ts'  (Phase C file select → explore)
      if (command === "auto" && (flags.blocksFromTo || flags.blocks)) {
        if (flags.blocksFromTo) {
          const [fromTag, toTag] = flags.blocksFromTo;
          await runChainAuto(proj, fromTag, toTag);
          return;
        }
        if (flags.blocks && isFileSelectToken(flags.blocks)) {
          const blocksSelect = parseBlocksSelect(flags.blocks);
          const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
          await runAutoExplore(
            proj,
            baseURL
              ? { cli: cliPicker, baseURL, blocksSelect }
              : { cli: cliPicker, blocksSelect },
          );
          return;
        }
        console.error(
          "waygraph auto --blocks expects <fromCheckpoint> <toCheckpoint>\n" +
            "  or file select: --blocks '**/mailpit/**/*.block.ts' / --blocks '/mailpit/'\n" +
            '  e.g. waygraph auto --blocks LoginPage OrderComplete\n' +
            '  for a hand-named chain use: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto src/flows/shop.flow.ts",
        );
        process.exit(1);
      }

      if (mapOnly || mermaid) {
        const orphans = await findOrphanBlocks(proj);
        const graph = await discoverGraph(proj);
        if (mermaid) {
          console.log(toMermaid(graph));
        } else {
          console.log(JSON.stringify({ ...graph, orphans }, null, 2));
        }
        console.error(
          `waygraph graph: ${graph.nodes.length} node(s), ${graph.edges.length} edge(s), ` +
            `${graph.skipped.length} Block(s) skipped (Out not resolvable), ` +
            `${orphans.length} orphan Block(s)`,
        );
        if (orphans.length > 0) {
          console.error(
            "waygraph graph: orphan Blocks block auto --blocks path-find - wire each into a .flow.ts (waygraph check)",
          );
        }
        return;
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      await runAutoExplore(proj, baseURL ? { cli: cliPicker, baseURL } : { cli: cliPicker });
      return;
}

export async function autoServeCase(args: string[]): Promise<void> {
      const proj = resolve(args[1] ?? process.cwd());
      const flags = parseRunFlags(args.slice(2));
      const sessionIdIdx = args.indexOf("--session-id");
      const sessionId = sessionIdIdx >= 0 ? args[sessionIdIdx + 1] : undefined;
      if (!sessionId) {
        console.error("waygraph __auto-serve: missing --session-id");
        process.exit(1);
      }
      const baseURL = flags.baseUrl ?? process.env.WAYGRAPH_BASE_URL ?? resolveBaseUrl(proj);
      const inject = flags.inject?.length ? resolveInjectRoots(flags.inject, proj) : undefined;
      let headless: boolean | undefined;
      if (flags.headlessBrowser) headless = true;
      else if (flags.nonHeadless) headless = false;
      await runAutoServeCommand(
        {
          projectDir: proj,
          ...(baseURL ? { baseURL } : {}),
          ...(flags.goto
            ? { startUrl: flags.goto, skipInitialNavigation: false }
            : flags.blank === true
              ? { skipInitialNavigation: true }
              : {}),
          ...(headless !== undefined ? { headless } : {}),
          ...(inject?.length ? { inject } : {}),
        },
        sessionId,
      );
      return;
}
