import { sel } from "../src/index.js";

// The role is Playwright's own union, and the options are getByRole's: a typo is a compile error, not a run-time miss.
export const ok = [sel.role("button", { name: "Login" }), sel.testId("x"), sel.label("Email", { exact: true })];

// @ts-expect-error: not an ARIA role
export const badRole = sel.role("buton");

// @ts-expect-error: not an option of getByRole
export const badOption = sel.role("button", { nam: "Login" });

// @ts-expect-error: `level` is a number
export const badLevel = sel.role("heading", { level: "2" });
