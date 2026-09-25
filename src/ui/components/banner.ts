import { ACCENT_SOFT, SURFACE } from "../tokens.js";

/** Top-left demo banner (`#wg-banner`). */
export function bannerCss(): string {
  return (
    "#wg-banner{position:fixed;z-index:2147483647;top:14px;left:14px;" +
    `background:${SURFACE};color:#fff;border-radius:12px;padding:10px 16px;` +
    "font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 20px rgba(0,0,0,.3);" +
    "border:1px solid rgba(124,58,237,.4);}" +
    `#wg-banner .wg-banner-tag{display:block;font-size:10px;font-weight:700;color:${ACCENT_SOFT};` +
    "letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px;}"
  );
}
