## ADDED Requirements

### Requirement: API clients are values
`client(name, { baseUrl?, headers?, as?, via? })` SHALL declare an API client: its own request context with the base
URL and headers, signed in as `as` (the account's session or token) or sharing a pane's cookies (`via`). An API Block
SHALL take `via: Client | Pane`; without it, it SHALL call as today (the browser's session).

#### Scenario: A second person's call
- **WHEN** an API Block has `via: PlannerApi`, a client `as: Planner`, and the browser is signed in as the admin
- **THEN** the call SHALL carry the planner's session, not the admin's

### Requirement: A burst plays a call many times at once
`{ times: n }` on an API Block's step SHALL start n calls together and land when all have finished; each SHALL be
recorded with its place in the burst.

#### Scenario: Twenty at once
- **WHEN** a step has `{ times: 20 }`
- **THEN** all twenty requests SHALL be in flight together, and the step SHALL record twenty results

### Requirement: Calls alongside a browser step
`{ alongside: [Block, ...], after?: ms }` on a step SHALL start the API Blocks at the same moment as the step's own action
(after `after` ms, when given), and the step SHALL land when the action and every call have finished. A failing call
SHALL NOT fail the step; what the app did is for the step's `expect`.

#### Scenario: Cancel while submitting
- **WHEN** `.method(SubmitOrder, { alongside: [CancelOrder] })` plays
- **THEN** the submit and the cancel call SHALL start together, and the step SHALL expect-check the outcome once both are done

### Requirement: A viewer can see what ran and how it went
In a demo (and its video), every API call SHALL show while it runs and when it finishes, on the page: a live **calls
card** listing each call by name with a state mark (running, good, bad), its status in words and time. A burst SHALL
show as one row with counts ("20 calls: 1 OK, 19 Conflict"), and a call alongside a browser step SHALL show beside that
step so the viewer sees both started together. When the step's expectations are judged, the card SHALL say whether the
outcome is **good or bad** in words ("Exactly one order was kept"), using the same pass/fail colours as the outcome card.

#### Scenario: A race on screen
- **WHEN** a demo plays a submit with a cancel call alongside
- **THEN** the card SHALL show "Submit order" and "Cancel order" running together, then each call's result and, after the
  step, whether the outcome was as expected

### Requirement: Results are data
Each call's result (status, body, time, its place in a burst, the client) SHALL be recorded in the run log with its step
and readable by expectations; the demo and Waygraph Studio SHALL show them.

#### Scenario: Reading a race's outcome
- **WHEN** a burst of twenty returns nineteen 409 and one 200
- **THEN** an expectation SHALL be able to say exactly one call succeeded, and Studio SHALL list the twenty
