// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import { applyDemoDefaults, applyRunFlags, parseRunFlags, resolveBaseUrl, resolveProjectDir, resolveSpec } from "../cli/flags.js";
import { runChain } from "../cli/run-chain.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { runChainAuto } from "./check.js";

export async function runCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph run: missing flow/spec — e.g.\n" +
            "  waygraph run src/flows/shop.flow.ts\n" +
            "  waygraph run --blocks shopFlow\n" +
            "  waygraph list   # file → export map\n" +
            "  Flags: --blocks --data --mem-stub --non-headless --video [dir] --step/--no-step",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      await runChain(proj, spec);
      return;
}

export async function chainCase(args: string[]): Promise<void> {
      // Compat alias: chain auto A B -> auto --blocks A B; else -> run --blocks.
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags);
      const first = flags.positionals[0];
      if (first === "auto") {
        const fromTag = flags.positionals[1];
        const toTag = flags.positionals[2];
        if (!fromTag || !toTag) {
          console.error("waygraph chain auto: missing <fromCheckpoint> <toCheckpoint> [project]");
          console.error("  prefer: waygraph auto --blocks LoggedIn OrderComplete");
          process.exit(1);
        }
        const proj = resolve(flags.positionals[3] ?? process.cwd());
        if (!existsSync(proj)) {
          console.error(`waygraph: no such directory: ${proj}`);
          process.exit(1);
        }
        await runChainAuto(proj, fromTag, toTag);
        return;
      }
      const spec = flags.blocks ?? first;
      if (!spec) {
        console.error(
          'waygraph chain: missing <spec> — prefer: waygraph run --blocks "a then b"\n' +
            "  or: waygraph auto --blocks <fromCheckpoint> <toCheckpoint>",
        );
        process.exit(1);
      }
      const proj = resolve(
        flags.blocks ? (flags.positionals[0] ?? process.cwd()) : (flags.positionals[1] ?? process.cwd()),
      );
      if (!process.env.WAYGRAPH_BASE_URL) {
        const resolved = resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
      }
      // If caller asked for step overlay, behave like demo; else like run.
      if (flags.step === true || process.env.WAYGRAPH_STEP === "1") {
        applyDemoDefaults(proj);
      }
      await runChain(proj, spec);
      return;
}

export async function demoCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1));
      applyRunFlags(flags, { allowAutoPlayVideo: true, allowDemoUi: true });
      const spec = resolveSpec(flags);
      if (!spec) {
        console.error(
          "waygraph demo: missing flow/spec — e.g.\n" +
            "  waygraph demo src/flows/shop.flow.ts\n" +
            "  waygraph demo --blocks shopFlow\n" +
            "  Flags: --blocks --data --mem-stub --auto-next --fast --full --mini --ff-expand --ff-disabled --auto-play-video --title --base-url --video",
        );
        process.exit(1);
      }
      const proj = flags.blocks
        ? resolveProjectDir(flags, 0)
        : resolve(flags.positionals[1] ?? process.cwd());
      if (!existsSync(proj)) {
        console.error(`waygraph: no such directory: ${proj}`);
        process.exit(1);
      }
      if (flags.step === undefined && process.env.WAYGRAPH_STEP === undefined) {
        process.env.WAYGRAPH_STEP = "1";
      }
      applyDemoDefaults(proj);
      console.error(
        `waygraph demo: STEP=${process.env.WAYGRAPH_STEP === "1" ? "on" : "off"}` +
          ` AUTO_NEXT=${process.env.WAYGRAPH_AUTOPLAY === "1" ? "on" : "off"}` +
          ` HEADED=${process.env.WAYGRAPH_HEADED === "0" ? "off" : "on"}` +
          ` BASE_URL=${process.env.WAYGRAPH_BASE_URL ?? "(unset)"}` +
          (process.env.WAYGRAPH_VIDEO ? ` VIDEO=${process.env.WAYGRAPH_VIDEO}` : "") +
          (process.env.WAYGRAPH_TITLE ? ` TITLE=${JSON.stringify(process.env.WAYGRAPH_TITLE)}` : ""),
      );
      await runChain(proj, spec);
      return;
}
