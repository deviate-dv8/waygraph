## Why

The demo decides how to play a step from what the step *does to the page*, guessing from Playwright calls:
`locator.fill` is typed key by key with a caret; a click gets a cursor move and a ring; anything else gets the same
treatment. That guess is wrong whenever a Block isn't a plain form field:

- **Hoppscotch** types a URL and a JSON body into code editors with `page.keyboard.type`: the demo types every
  character slowly, which a viewer finds noise ("typing a URL isn't valuable"), and since there's no locator to ring, it
  highlights the whole editor, never the key or value being set.
- **Other cases** that aren't "typing" in the human sense: pasting a token, dropping a file, setting a slider, filling a
  date, a masked field, a canvas. The demo can't know.

The Block knows what it does; today it can't say.

## What Changes

- **Capabilities on a Block.** A Block declares how it should play: `play: "type" | "paste" | "set" | "click" | "blitz"`
  (its default pace and gesture: `paste` puts the value in at once with a "pasted" mark, `blitz` skips the theatre and
  shows only the result, `type` is the human default), and what it **shows**: `shows: { selector, key?, value? }`,
  the piece of the page to highlight. A step still overrides it (`{ pace }`, `{ play }`), as `pace` does today.
- **Highlight the key and the value.** A Block that sets part of a structured value (a JSON body, a header row, a form
  field) names the key and the value it sets (`shows: { key: "username", value: "standard_user" }`); the demo rings the
  key and the value separately (or both together), instead of the whole component. In a code editor it finds the token.
- **Hoppscotch's Blocks use them:** the URL and body are `paste` (appear at once, with the value named), and its JSON
  rings the key and value being set.
- **The right gesture by what a Block says,** not by guessing from the Playwright call: nothing about a flow's steps
  changes.

## Capabilities

### New Capabilities
- `block-capabilities`: `play` and `shows` on Method (and Page) Blocks, the demo's use of them, step overrides, key/value highlighting.

### Modified Capabilities
<!-- none -->

## Impact
- **Engine:** Block options `play`, `shows` (typed, marked on the Block like `__waygraphPace`); step option `play`.
- **Demo:** `demo/overlay/locator-theater.ts` and the keyboard patch honour `play`; a key/value ring in `rings.ts`.
- **Scaffold:** Hoppscotch's Methods declare `paste` / `shows`. **Docs:** the demo guide ("How a step plays"), the blocks guide.
- **Parity:** the same on one page and with panes (a pane's steps play by their Blocks' capabilities).
