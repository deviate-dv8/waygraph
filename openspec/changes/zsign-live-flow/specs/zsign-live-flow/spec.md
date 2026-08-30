## Purpose

Proves the core spine's abstractions against a real running application instead of a
fixture, by driving zsign-app's actual register -> verify-email -> login flow end to end.

## ADDED Requirements

### Requirement: The flow registers a unique user against the live API
Running the flow SHALL create a new user account against the running API using a
generated email unique to that run, so repeated runs never collide with a prior run's
account.

#### Scenario: Two consecutive runs do not collide
- **WHEN** the flow is run twice in a row
- **THEN** each run SHALL register a distinct email address and SHALL NOT fail due to a
  duplicate-account conflict from the previous run

### Requirement: The flow verifies the account via the real verification email
Running the flow SHALL retrieve the verification email actually sent by the API through
the live email-capture service, extract the verification token from it, and submit that
token to the API's verification endpoint.

#### Scenario: Verification succeeds using the real email content
- **WHEN** the flow reaches the verify-email step
- **THEN** it SHALL locate the verification email addressed to the run's generated
  address, extract a token from its content, and the subsequent verification request
  SHALL succeed

### Requirement: The flow logs in through the real UI and reaches the dashboard
Running the flow SHALL drive the actual login page in a real browser using the
credentials just registered, and SHALL reach the authenticated dashboard.

#### Scenario: Login reaches the dashboard
- **WHEN** the flow submits the real login form with the registered credentials
- **THEN** the browser SHALL navigate to the dashboard, and the flow's terminal
  Checkpoint SHALL reflect that success

### Requirement: The flow makes no destructive changes to shared state
Running the flow SHALL NOT flush or reset any shared service state (such as the shared
rate-limit store), and SHALL NOT modify data belonging to any account other than the one
it created for that run.

#### Scenario: Other accounts and shared state are unaffected
- **WHEN** the flow completes, successfully or not
- **THEN** no account other than the one it registered SHALL be modified, and no
  shared-service reset SHALL have been triggered
