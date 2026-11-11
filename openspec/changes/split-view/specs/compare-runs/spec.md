## ADDED Requirements

### Requirement: Play one flow twice, side by side
`waygraph demo <flow> --compare <what>=<a>,<b>` and `waygraph run <flow> --compare ...` SHALL play the flow twice,
once per side, each side in its own context, where `<what>` is `as` (two accounts), `device` (two devices) or `config`
(two configs, `--config` names). The two sides SHALL play step by step together: neither starts step N+1 before both
finished step N. In a demo they SHALL show on the stage, side by side, labelled with what differs.

#### Scenario: Desktop and phone
- **WHEN** `waygraph demo checkoutFlow --compare device=desktop,iphone-15` runs
- **THEN** the stage SHALL show the desktop side and the phone side, each step played on both before the next

### Requirement: The differences are reported
A compared run SHALL report, per step, where the two sides differ: a different page landed on, a check that passed on
one side and failed on the other, a Read field with different values. A side that fails SHALL stop that side; the other
SHALL play on, and the report SHALL say where they parted. The run's exit code SHALL be non-zero when either side
fails; differences alone SHALL NOT fail it.

#### Scenario: One side can't see a button
- **WHEN** `--compare as=planner,admin` plays a flow whose step 4 clicks a button only admins have
- **THEN** the report SHALL say step 4 failed for planner and passed for admin, and the admin side SHALL finish the flow

#### Scenario: Same steps, different data
- **WHEN** both sides pass every step but `cart.total` reads `$29.99` on one and `$32.39` on the other
- **THEN** the report SHALL list `cart.total` under that step, with both values

### Requirement: Compared runs in the run log and Waygraph Studio
A compared run SHALL be one run log with both sides (each step marked with its side) and its differences. Waygraph Studio
SHALL show it as two lanes and list the differences beside the steps they're on.

#### Scenario: Opening a compared run
- **WHEN** a compared run is opened in Waygraph Studio
- **THEN** it SHALL show both sides' steps and mark each step where they differ
