// Split out of the former 8,700-line cli.ts (see src/ARCHITECTURE.md). Behavior unchanged.
import type { SessionMeta } from "../browser.js";

export function printBrowserUsage(): void {
  console.log(`waygraph browser — persistent Playwright sessions (headful by default)

  waygraph browser start [--inject preset|path] [--goto <url>] [--blank] [--headless] [--cli] [project]
                           Open a new session (about:blank by default)
  waygraph browser sessions [--json] [project]
                           List live sessions for a project
  waygraph browser stop <sessionId|--all> [project]
  waygraph browser attach <sessionId>       Terminal picker on a live session

  waygraph browser status <sessionId>       Current menu (no side effects)
  waygraph browser send <sessionId> "<pick>"
  waygraph browser reach <sessionId> <Checkpoint>
  waygraph browser dom|trace|console|storage|highlight <sessionId> …
  waygraph browser click|type|press|goto|upload|reload|resync <sessionId> …

  auto send|status|… and pilot send|status|… use the same session ids.`);
}


export function printBrowserSessionsList(sessions: SessionMeta[], projectDir: string): void {
  if (sessions.length === 0) {
    console.log(`No live browser sessions for ${projectDir}.`);
    console.log("  waygraph browser start");
    return;
  }
  console.log(`Live browser sessions (${projectDir}):`);
  for (const s of sessions) {
    const mode = s.headless ? "headless" : "headful";
    console.log(`  ${s.sessionId}  ${mode}  pid ${s.pid}`);
    console.log(`    waygraph browser attach ${s.sessionId}`);
    console.log(`    waygraph browser stop ${s.sessionId}`);
  }
}


export function usage(): void {
  console.log(`waygraph -- graph project tool + engine CLI

Primary (less is more):
  waygraph auto  [project|.flow.ts]        Interactive explore (picker)
                 --cli                     Terminal menu instead of browser panel
                 --cli --detach            Run the --cli session as a background socket
                                           server; prints {sessionId, socketPath} and exits
                 --blocks <From> <To>      Graph path-find From->To, then run
                 --data '{...}'            Mem seed (same as demo/run)
                 (pass a .flow.ts to run that flow - same as run)
                 --cli --detach --non-headless  Detached session with a real visible browser
                                           (same --non-headless flag run/demo already use)
  waygraph auto send <sessionId> "<pick>"  Send one pick to a --detach session, print
                                           the resulting state as JSON (no TTY needed).
                                           <pick> is a 1-based menu index, a Block name
                                           (exact match; ambiguous names refuse rather than
                                           guess), or "q"/"quit". Same command as
                                           browser send <sessionId> "<pick>" (prefer that
                                           prefix for a --detach/persistent session).
                 --timeout <ms>            Override the 15s default wait for this one call -
                                           a single Block can legitimately run a slow real
                                           interaction (e.g. a multi-step mouse drag)
  waygraph auto status <sessionId>         Read a --detach session's state (no side effects)
  waygraph auto attach <sessionId>         Reopen an interactive terminal against a
                                           running --detach session
  waygraph auto dom <sessionId>            Read the live page's structure (no side effects)
                 --mode aria|full          Default aria (Playwright ariaSnapshotJSON, AI mode);
                                           full = bounded raw DOM walk (tag/attrs/text/children)
                 --selector <sel>          Scope either mode to one element's subtree
                 --depth N                 Limit snapshot depth (aria: native; full: caller cap)
  waygraph auto trace <sessionId>          Read the session's Checkpoint/Block-level history
                                           (no side effects; not raw click/fill recording)
  waygraph auto console <sessionId>        Read the real browser console/pageerror messages and
                                           failed (4xx/5xx) network responses seen so far - for
                                           diagnosing a silent failure (e.g. a form submit that
                                           does nothing observable in the DOM) that inspectDom
                                           alone can't explain, since it only reads what actually
                                           rendered, not what the page/network actually said
  waygraph auto storage <sessionId>        Read localStorage/sessionStorage plus registered
                                           service workers (scope/active URL/state) - client-
                                           side state (push-subscription/auth tokens etc.) that
                                           never appears in the rendered DOM inspectDom reads
  waygraph auto click <sessionId> <sel>    Click a real element - works even with zero Blocks
                                           (Blind Pilot: act before any Block covers this)
  waygraph auto type <sessionId> <sel> <text>  Fill a real input the same way
  waygraph auto goto <sessionId> <url>     Navigate the real live page
  waygraph auto press <sessionId> <sel> <key>
                                           Presses a real key (Playwright name, e.g. Enter,
                                           Escape, Tab) on a real focused element - many real
                                           inline-edit inputs (no visible Save button until you
                                           type) commit on Enter, not blur/click-elsewhere
  waygraph auto upload <sessionId> <sel> <image|pdf|video|path>
                                           Fill a real <input type="file"> - a built-in stub
                                           (small, real, valid: assets/stubs/stub.png|pdf|mp4)
                                           or a caller-supplied file path
                 (click/type/goto/upload each re-detect the session's Checkpoint afterward,
                  same detection send/status already use)
  waygraph auto reload <sessionId>         Re-discover the project's Block library/graph
                                           from disk without restarting the session - picks
                                           up a Block written to disk mid-session
  waygraph auto reach <sessionId> <Checkpoint>  Path-find from here to Checkpoint and run
                                           the whole route in one call - not one auto send
                                           per step. Same findBlockPath BFS auto --blocks
                                           <From> <To> already uses, against this session's
                                           own live graph/position. Fails loud (not a guess)
                                           if a step has several live options on the page
                                           (an instanceOptions Block) - use send for that step
  waygraph auto resync <sessionId>         Force here to be re-detected from the real live
                                           page right now, discarding whatever was cached -
                                           fixes a session's tracked position going stale
                                           after anything OUTSIDE this session changed the
                                           page (e.g. a human clicking around in a visible
                                           --non-headless session someone is co-driving);
                                           send/reach never do this on their own, since they
                                           only re-detect when the position is already unknown
  waygraph auto highlight <sessionId> '<json>'
                                           Paint agent highlight fixtures on the live page
                                           (rings + optional todos). Same visual language as
                                           Block stubBefore in demo. JSON: rings[{selector,
                                           label,tone?,size?,weight?}], todos[], todoIndex?,
                                           todoTitle?, holdMs? (0=until next), clear:true.
                                           Missing selectors listed in response, not fatal.
                                           Same command as browser highlight <sessionId>
                                           '<json>' (prefer that prefix for a --detach/
                                           persistent session).
                 <selector>|<label>[|<tone>]   Shorthand for 1-3 rings, no JSON braces/quotes
                                           to escape - rings separated by ";", e.g.
                                           "#x|Login button|warning; .err|Error banner|danger".
                                           Covers selector/label/tone only; anything else
                                           (size/weight/zoom/focus/todos/...) needs the JSON
                                           form above.
  waygraph browser                         Show browser subcommands
  waygraph browser start                   Open a new session (headful by default, about:blank)
                 --inject preset|path            Merge an external Block library (e.g. saucedemo)
                 --goto <url>              Navigate on start (disables blank page)
                 --blank                   Force about:blank on start (default)
                 --headless                Headless session (default is visible browser)
                 --cli                     After start, open the terminal picker (auto attach)
  waygraph browser sessions [project]      List live browser sessions (attach/status/stop by id)
  waygraph browser send|status|attach|…    Same session control as auto (see auto send/status/…)
  waygraph pilot start                     Bootstrap: browser session + whole-project graph +
                                           starting snapshot in one call. Does not plan or act.
                 --inject / --goto / --headless / --cli / --base-url  Same flags as browser start
  waygraph pilot sessions [project]        List live sessions (prefer attach over a new start)
  waygraph pilot attach <sessionId>        Graph + snapshot for an existing session (no new browser)
  waygraph pilot send|status|highlight|…   Same session control as browser/auto
  waygraph auto                            Interactive explore (picker) — NOT the persistent browser
                                           layer; use browser/pilot for agent-driven sessions.
  waygraph demo  [--blocks <flow|file|spec>]  Watch with step overlay (QA path)
                 --data '{...}'            Mem seed JSON (or inline flow({...}))
                 --mem-stub                Fill any requires key --data didn't cover from
                                           registerMemStub's registry (needs the key
                                           registered, or the flow's own withMemStub - a
                                           key with neither still fails preflight)
                 --auto-next               Auto-advance steps (alias: --autoplay)
                 --fast                    Shorter auto-next / Next gates (keeps smooth cursor)
                 --full                    Classic wrap-all block chips (default: carousel)
                 --mini                    Force compact mini panel (Hide pill + Next); alias --stepper-mini
                 --todo-left|--todo-right  Floating checklist dock side (also ctx.todoPos / WAYGRAPH_TODO_POS)
                 --todo-full               Opt out: full checklist, no compact/collision/behind-ring
                 --todo-smart              Opt in: compact + collision + behind-ring (default)
                 --ff-expand               Expand fastForwardComposeBlock inners as separate steps
                 --ff-disabled             Dispute: expand FF (alias --no-ff); blitz kept on those inners
                 --auto-play-video         Unattended + recorded: --auto-next + --video (+ step); headless
                 --auto-play-video-head    Same, but keep the browser visible (--non-headless)
                 --video [dir]             Record .webm (demo: headless unless --non-headless)
                 --video-viewport WxH       Recording size (default demo: 1920x1080)
                 --title / --base-url
  waygraph run   [--blocks <flow|file|spec>]  Execute (no overlay unless --step)
                 --data '{...}'
                 --mem-stub                Same as demo's --mem-stub
                 --non-headless            Show browser
                 --video [dir]             Record .webm
                 --video-viewport WxH       Recording size (default run: 1280x720)
                 --ff-expand               Same as demo (expand FFCompose inners)
                 --ff-disabled             Same as demo (dispute: expand FF)
  waygraph test                            Runs the project's @playwright/test suite (cwd) -
                                           thin wrapper: forwards to the local playwright
                                           binary (or npx playwright as a fallback)
                 test ui  /  test --ui     Playwright UI Mode (interactive, watch + trace)
                 test report [dir]         Open the last HTML report (playwright show-report)
                 test show-trace <file>    Open one trace.zip in the trace viewer
                 <any other args>          Forwarded verbatim (--grep, a spec path, --headed, …)
                                           Scaffolds ship trace: "retain-on-failure" + the
                                           html reporter, so a failed waygraph test already
                                           has a trace - test report opens it.

Also:
  waygraph list | nav | validate | check | typecheck | graph | init <name>
                 check/typecheck --no-practices  Skip bad-practice warnings
  waygraph map   [project]                 Waygraph Map convention enforcement: every static
                                           Nav/Page url must verbatim-match its src/map/ folder
                                           path ((group) segments excluded) - exits 1 on a
                                           violation, unlike check's warnings-only stance. A
                                           no-op (exit 0, informational) if the project has no
                                           src/map/ directory at all.
  waygraph traverse [project]              Graph crawl (Phase B-E)
                 --blocks <glob|/re/|sub>  Phase C: filter *.block.ts discovery
                 --parallel N              Phase D: N clone workers (max 4)
                 --session clone|inherit   Phase D: default clone
                 --from <Checkpoint>       Seed / start checkpoint
                 --data '{...}'            Mem seed
                 --max-steps N             Cap Block runs (default 50)
                 --max-visits N            Cap visits per node (default 2)
                 --non-headless            Show browser
  waygraph agent-dive [--loop claude|opencode|cursor|vscode] [--prompts]
                 Initialize coding-agent defs (Playwright init-agents analogue)
  waygraph try [demo|auto|auto:cli]        One-shot saucedemo in a temp dir
                 try auto                  Headed browser panel (default)
                 try auto:cli / --cli      Terminal menu instead
                 try auto --headed         Same as try auto (compat)

Skills (print packaged skill markdown to stdout - for agents / paste):
  waygraph --skill                         List available skills
  waygraph --skill-pilot                   Drive an existing Block graph
  waygraph --skill-pilot-blind             Cold-start: raw ops + author Blocks
  waygraph --skill-convention              Block/Map authoring conventions

Examples:
  waygraph list                                          # file → export map
  waygraph run src/flows/shop.flow.ts --data '{...}'
  waygraph run --blocks shopFlow --non-headless --video
  waygraph demo --blocks src/flows/cart-bulk.flow.ts --auto-next --fast
  waygraph demo src/flows/shop.flow.ts --full
  waygraph try auto
  waygraph try auto:cli
  waygraph auto src/flows/shop.flow.ts --data '{...}'   # run by file (same as run)
  waygraph auto --cli --data '{"saucedemo.credentials":{...}}'
  waygraph auto --blocks LoginPage OrderComplete
  waygraph auto --blocks '/mailpit/'                     # Phase C filtered explore
  waygraph traverse --blocks '**/mailpit/**/*.block.ts'  # Phase C filtered crawl
  waygraph traverse --parallel 2 --session clone         # Phase D clone workers
  waygraph run  --blocks "loginFlow then add-all-to-cart" --data '{...}' --video

Aliases (compat): \`chain <spec>\` -> run --blocks; \`chain auto A B\` -> auto --blocks A B;
  --autoplay -> --auto-next. Prefer the primary verbs above.

Project path optional (defaults to cwd). Flags beat WAYGRAPH_* env.
\`run\`/\`demo\`/\`auto\`: Flow export, .flow.ts path, or "a then b" chain (auto also explores).
Hide stepper = compact "N / M · block" pill. Collapses while a step runs (clicks hit the page). Video mode stays compact.
`);
  process.exit(0);
}
