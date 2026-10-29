// `waygraph auto` / `graph` / `browser` / `pilot`: hands `browser` and `pilot` subcommands and session ops to their
// files, then runs the interactive explore (or the graph print) for a project; `__auto-serve` is the session child.
import { projectDirOf } from "../util.js";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { discoverGraph, findOrphanBlocks, toMermaid } from "../../analysis/graph.js";
import { envString } from "../../engine/env.js";
import { runAutoServeCommand } from "../../live/auto-session/ipc.js";
import { runAutoExplore } from "../../live/auto/auto.js";
import { resolveInjectRoots } from "../../manifest/roots.js";
import { isFileSelectToken, parseBlocksSelect } from "../../manifest/select.js";
import { resolveBaseUrl, useProjectBaseUrl } from "../../runtime/waygraph-config.js";
import { applyRunFlags, looksLikeFlowFileRef, parseRunFlags } from "../flags.js";
import { runChain, runChainAuto } from "../run-chain.js";
import { browserCase } from "./browser.js";
import { pilotCase } from "./pilot.js";
import { isSessionOp, sessionOpCase } from "./session-ops.js";



export async function sessionCase(args: string[], command: string | undefined): Promise<void> {
      if (command === "browser" && (await browserCase(args))) return;
      if (command === "pilot" && (await pilotCase(args))) return;
      // A session op (`auto|browser|pilot send <sessionId> ...`) runs against a running session, before any project path.
      if ((command === "auto" || command === "browser" || command === "pilot") && isSessionOp(command, args[1])) {
        await sessionOpCase(args, command);
        return;
      }

      const flags = parseRunFlags(args.slice(1), command ?? "auto");
      applyRunFlags(flags);
      const mermaid = flags.mermaid === true;
      const mapOnly = command === "graph" || flags.map === true;
      const cliPicker = flags.cli === true;
      const firstPos = flags.positionals[0];

      // auto src/flows/shop.flow.ts → run that flow (same as `run`). Do not
      // treat a .flow.ts path as a project directory (existsSync is true for files).
      if (command === "auto" && firstPos && looksLikeFlowFileRef(firstPos) && !flags.blocksFromTo) {
        const proj = projectDirOf(command, undefined);
        await useProjectBaseUrl(proj);
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
          const baseURL = flags.baseUrl ?? envString("WAYGRAPH_BASE_URL") ?? (await resolveBaseUrl(proj));
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
      const baseURL = flags.baseUrl ?? envString("WAYGRAPH_BASE_URL") ?? (await resolveBaseUrl(proj));
      await runAutoExplore(proj, baseURL ? { cli: cliPicker, baseURL } : { cli: cliPicker });
      return;
}

export async function autoServeCase(args: string[]): Promise<void> {
      const proj = resolve(args[1] ?? process.cwd());
      const flags = parseRunFlags(args.slice(2), "__auto-serve");
      const sessionId = flags.sessionId;
      if (!sessionId) {
        console.error("waygraph __auto-serve: missing --session-id");
        process.exit(1);
      }
      const baseURL = flags.baseUrl ?? envString("WAYGRAPH_BASE_URL") ?? (await resolveBaseUrl(proj));
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
