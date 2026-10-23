import { defineNavBlock } from "../src/engine/block/kinds/nav.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";


// Exactly one of url/click is required - giving one alone compiles fine.
const _urlOnly = defineNavBlock({ name: "nav-login", checkpoint: checkpoint("LoginForm"), url: "/login" });
void _urlOnly;

const _clickOnly = defineNavBlock({ name: "nav-login", checkpoint: checkpoint("LoginForm"), click: "text=Log in" });
void _clickOnly;

// Neither is a compile error - the opinionated point: an agent can't skip
// declaring HOW this Block navigates.
// @ts-expect-error - one of url/click is required
const _neither = defineNavBlock({ name: "nav-login", checkpoint: checkpoint("LoginForm") });
void _neither;

// Both at once is also a compile error - pick one navigation mechanism, not
// a block that ambiguously does either depending on which field a reader
// happens to notice first.
// @ts-expect-error - url and click are mutually exclusive
const _both = defineNavBlock({ name: "nav-login", checkpoint: checkpoint("LoginForm"), url: "/login", click: "text=Log in" });
void _both;
