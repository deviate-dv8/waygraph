## ADDED Requirements

### Requirement: A step's calls are shown with the step, in words
After a demo step, the step's card SHALL list the calls the step made to the app's backend (requests the page sent to
the app's origin or a configured API origin, and an API Block's own call), one line each: a name for the call, its
status as a code and in words, and how long it took. A call with a status of 400 or above SHALL be marked failed, even
when the step passed. Calls to other origins SHALL be left out unless `demo.network.show` is `"all"`.

#### Scenario: Analytics noise is left out
- **WHEN** a step's page sends two requests to an analytics service on another origin, both answered 401
- **THEN** the step's card SHALL not list them, and nothing on screen SHALL mark them as failures

#### Scenario: A failed call is marked though the step passed
- **WHEN** a step's verify passes, but a request it made to the app was answered 500
- **THEN** the step's card SHALL show that call as failed, with "500 Server error", and the step SHALL still pass

#### Scenario: In a flow with panes
- **WHEN** a step in the `admin` pane makes a call
- **THEN** the call SHALL show in that step's card in the admin pane, and in the run log with that step

### Requirement: Calls have names
`demo.network.names` SHALL name calls by method and route (a route may have `:params`); a call without a name SHALL read
as its method and the route's last named segments. The name SHALL be used in the demo, the run log and Waygraph Studio.

#### Scenario: A named call
- **WHEN** `demo.network.names` has `"POST /api/machines": "Saved the machine"` and a step posts to `/api/machines`
- **THEN** its line SHALL read "Saved the machine · 201 Created"

### Requirement: An API step has a card of its own
A step whose Block is an API Block SHALL show, in the demo, the request (method, address, body as a table of fields),
the response (status in words, body as a table of fields, long values folded) and each of its checks with pass or fail.

#### Scenario: Checking the backend's health
- **WHEN** an API step GETs `/todos/1` and gets 200 with `{ id, title, completed }`
- **THEN** its card SHALL show "GET /todos/1 · 200 OK" and the three fields with their values

### Requirement: The calls are kept
Each call a step made SHALL be recorded in the run log with the step (method, route, status, time, name, and whether
it failed), and Waygraph Studio SHALL list them on the run's step.

#### Scenario: Reading a run afterwards
- **WHEN** a run's step made two calls, one of them failed
- **THEN** the step in Waygraph Studio SHALL list both by name and mark the failed one
