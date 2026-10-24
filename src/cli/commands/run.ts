import { resolveBaseUrl } from "../../runtime/waygraph-config.js";
import { applyDemoDefaults, applyRunFlags, parseRunFlags, resolveProjectDir, resolveSpec } from "../flags.js";
import { runChain } from "../run-chain.js";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { envFlag, envString, setEnv } from "../../engine/env.js";

export async function runCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1), "run");
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
      if (!envString("WAYGRAPH_BASE_URL")) {
        const resolved = await resolveBaseUrl(proj);
        if (resolved) setEnv("WAYGRAPH_BASE_URL", resolved);
      }
      await runChain(proj, spec);
      return;
}

export async function demoCase(args: string[]): Promise<void> {
      const flags = parseRunFlags(args.slice(1), "demo");
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
      if (flags.step === undefined && envString("WAYGRAPH_STEP") === undefined) {
        setEnv("WAYGRAPH_STEP", "1");
      }
      await applyDemoDefaults(proj);
      console.error(
        `waygraph demo: STEP=${envFlag("WAYGRAPH_STEP") ? "on" : "off"}` +
          ` AUTO_NEXT=${envFlag("WAYGRAPH_AUTOPLAY") ? "on" : "off"}` +
          ` HEADED=${envString("WAYGRAPH_HEADED") === "0" ? "off" : "on"}` +
          ` BASE_URL=${envString("WAYGRAPH_BASE_URL") ?? "(unset)"}` +
          (envString("WAYGRAPH_VIDEO") ? ` VIDEO=${envString("WAYGRAPH_VIDEO")}` : "") +
          (envString("WAYGRAPH_TITLE") ? ` TITLE=${JSON.stringify(envString("WAYGRAPH_TITLE"))}` : ""),
      );
      await runChain(proj, spec);
      return;
}
