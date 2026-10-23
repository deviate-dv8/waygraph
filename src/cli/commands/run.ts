import { resolveBaseUrl } from "../../runtime/config.js";
import { applyDemoDefaults, applyRunFlags, parseRunFlags, resolveProjectDir, resolveSpec } from "../flags.js";
import { runChain } from "../run-chain.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

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
        const resolved = await resolveBaseUrl(proj);
        if (resolved) process.env.WAYGRAPH_BASE_URL = resolved;
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
      await applyDemoDefaults(proj);
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
