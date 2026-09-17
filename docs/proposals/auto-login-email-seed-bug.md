# Bug: `waygraph auto` mis-seeds Mem keys containing `"login"`

**Status:** fixed in engine (Option A) — ship with `waygraph@0.12.7+`  
**Origin:** PIA `pia-waygraph` handoff (2026-09-17) / https://mdview.io/s/p2e725a41  
**File:** `src/auto-explore-run.ts` — `defaultMemValueForKey`, `seedDefaultMem`, `promptMemCli`

## Problem

`defaultMemValueForKey()` returned saucedemo credentials when `keyName.includes("login")`.
Consumer projects using `key<string>("login-email")` got an object default on `waygraph auto`
start — blocks reading that key fail (email fill, Mailpit recipient filter, etc.).

## Fix (shipped)

Exact credential key names only:

- `login-credentials`
- `credentials`
- `saucedemo.credentials`

`login-email` and other `login*` string keys stay **unset** until `--data` /
`WAYGRAPH_AUTO_MEM` / CLI prompt.

## PIA follow-up

Remove `WAYGRAPH_AUTO_MEM` workaround from `pia-waygraph/scripts/auto.sh` after upgrading
past the fixed version.

Full write-up: `pia/pia-waygraph/docs/waygraph-bug-auto-login-email-seed.md`
