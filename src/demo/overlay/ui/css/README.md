# `src/ui/css/`

The overlay's actual stylesheet - real `.css`, not a JS template-string generator. One rule set,
loaded once, injected into the Shadow DOM every overlay surface mounts in (`ui/shadow.ts`). No
surface writes its own copy of ring/cursor/banner/dock CSS; they all pull this bundle.

Built on [Open Props](https://open-props.style) (`node_modules/open-props`) for structural scales
(z-index, easing, shadow) via its `.shadow.min.css` builds, written for exactly this - variables
scoped to a shadow root's `:host` instead of `:root`. Brand tones (`--wg-tone-*`) are ours.

- `tokens.css` - the one place a color/size/z-index changes. Every other file reads it via `var()`.
- `ring.css`, `cursor.css`, `banner.css`, `dock.css`, `panel.css` - one component per file.

`scripts/copy-ui-css.mjs` concatenates Open Props' subset + these files, in a fixed order, into
`dist/ui/overlay.css` after `tsc` (see `npm run build`). Add a new `.css` file here and you MUST
add it to that script's `ORDER` array, or the build fails loudly instead of silently dropping it.

Loaded at runtime by `src/ui/stylesheet.ts` (`getOverlaySheet()`), cached after the first read.
