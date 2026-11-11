## ADDED Requirements

### Requirement: A Block says how it plays
A Method Block SHALL accept `play` (`"type"`, `"paste"`, `"set"`, `"click"`, `"blitz"`). The demo SHALL play the step by it:
`type` key by key as today; `paste` puts the value in at once and marks it as pasted; `set` is a value set with no typing
(a slider, a date); `click` a pointer click; `blitz` skips the theatre and shows only the result. Without `play`, the
demo SHALL guess as today. A step's `{ play }` SHALL override the Block's.

#### Scenario: A pasted URL
- **WHEN** a Method has `play: "paste"` and types a URL with `page.keyboard.type`
- **THEN** the demo SHALL NOT type it character by character; the value SHALL appear at once, marked as pasted

### Requirement: A Block says what it shows
A Block SHALL accept `shows: { selector?, key?, value? }`. When `key` or `value` is named, the demo SHALL ring that key
and that value (together or each) in the component, not the whole component; in a code editor it SHALL find the token.

#### Scenario: A JSON field
- **WHEN** a Block sets `"username": "standard_user"` in a JSON editor and has `shows: { key: "username", value: "standard_user" }`
- **THEN** the demo SHALL ring `username` and `standard_user`, not the whole editor

### Requirement: The same with one page and with panes
A Block's capabilities SHALL apply in every pane as on one page.
