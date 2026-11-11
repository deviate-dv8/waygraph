## 1. Capture per step

- [ ] 1.1 `network-capture.ts`: each call tagged with its step (the run's current step), finished calls kept per step;
      the app's origins (base URL, `demo.network.apis`)
- [ ] 1.2 Status words (D3) and call names (D4), in `engine/` so the run log, the demo and the UI share them
- [ ] 1.3 `step:call` run events (D6); `defineApiBlock` records its call with the step
- [ ] 1.4 Tests: a step's calls are its own; third-party calls are left out; names and words; the run log

## 2. In the demo

- [ ] 2.1 The step's after card lists its calls (name, status in words, ms; failed marked; "N more", "N left out")
- [ ] 2.2 An API step's card (request, response as field tables, checks); secrets masked
- [ ] 2.3 The network panel rebuilt: the step's calls first, rows in words, the detail as tables, cURL kept;
      `demo.network.show`
- [ ] 2.4 Overlay tokens, Storybook stories, light and dark; recordings readable at 1920×1080
- [ ] 2.5 Tests: the card on a page that makes failing and third-party calls; the API card

## 3. Config, run log and Waygraph UI

- [ ] 3.1 `demo.network` in the config (`show`, `names`, `apis`), typed and in the config reference
- [ ] 3.2 Waygraph UI: a run's step lists its calls (name, words, ms, failed)
- [ ] 3.3 UI tests

## 4. Docs and examples

- [ ] 4.1 saucedemo's API demo and the scaffold's Hoppscotch flows read well with the new cards
- [ ] 4.2 Docs: the demo guide's network section, the config reference, the run log reference; ROADMAP
- [ ] 4.3 Full verify (offscreen)
