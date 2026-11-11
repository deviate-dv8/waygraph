## Decisions
### D1. Declared, not guessed
`play` and `shows` are Block options marked like pace (`__waygraphPlay`, `__waygraphShows`); the demo reads them in the locator theatre and the keyboard patch. A Block with none plays as today: nothing changes for existing projects.
### D2. `paste` without a locator
For `keyboard.type` into an editor, the demo's keyboard patch (not Playwright's `fill`) types the whole string in one `keyboard.insertText`, then rings; the Block's code stays as written.
### D3. Key and value highlighting
The ring takes `{ key, value }`: for an input, the label and the value; for text (a code editor, JSON), it finds each token in the element's text by Range and rings those rectangles. If the token isn't found, it rings the component, as today.
### D4. Overrides
Step `{ play }` > Block `play` > guess. `{ pace }` is separate and unchanged.
## Risks
- A token that appears twice (the same key in two places) rings the first inside the Block's selector; `shows.selector` narrows it.
