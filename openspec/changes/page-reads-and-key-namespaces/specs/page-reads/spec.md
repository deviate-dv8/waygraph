## ADDED Requirements

### Requirement: Read namespaces are declared like key namespaces
The package SHALL export `reads(namespace)`, returning a function taking an object type `T` and returning a read
namespace. Reading property `p` SHALL give a `ReadKey<T[p]>` named `"<namespace>.<p>"`, the same object on every read.
Calling the namespace with a spec object SHALL return a read spec; the spec's type SHALL be checked against `T`: every
property optional, each value a reader of that property's type, or (for an object-typed property) a nested spec.

#### Scenario: A reader of the wrong type does not compile
- **WHEN** `Post = reads("post")<{ likes: number }>()` and a page declares `Post({ likes: Read.text(sel) })`
- **THEN** TypeScript SHALL report a type error

#### Scenario: A page may read part of a namespace
- **WHEN** a feed page declares `Post({ title: Read.text(sel) })` without the namespace's other properties
- **THEN** it SHALL compile, and its read SHALL contain only `post.title`

### Requirement: Read helpers cover the common reads
`Read` SHALL provide `text(sel)` (trimmed text of the first match), `texts(sel)` (each match's trimmed text),
`number(sel)` (the first number in the first match's text, ignoring currency signs and thousands separators),
`attr(sel, name)`, `value(sel)` (a form field's value), `visible(sel)` (boolean), `count(sel)`, and `list(rowSel, spec)`
(one object per row, each field read inside its row). Any field MAY instead be a function `(page, mem) => value`. A read
SHALL NOT wait for elements to appear: it reads the page as it is.

#### Scenario: A list reads each row's fields inside the row
- **WHEN** a page reads `Post({ comments: Read.list(".comment", { author: Read.text(".author"), body: Read.text(".body") }) })`
  on a page with two comments
- **THEN** `post.comments` SHALL be two objects, each with that comment's own author and body

#### Scenario: A missing element is reported, not thrown
- **WHEN** `Read.text(".error")` runs on a page with no `.error` element
- **THEN** the read SHALL complete, `post.error` SHALL be listed in `missing`, and `has` SHALL return false for it

### Requirement: Page Blocks declare a read and return a ReadPage
`definePageBlock` SHALL accept `read`: one read spec or an array of them. The Block SHALL expose
`read(page, mem?)` returning a `ReadPage` with `get(key)` (typed by the key; throws `WG_READ_MISSING` naming the key when
missing or not declared), `has(key)`, `missing` (paths), and `toJSON()` (nested objects by key path, missing paths as
`null`). A page Block without `read` SHALL return an empty `ReadPage`.

#### Scenario: get returns the typed value
- **WHEN** a page reads `Post({ likes: Read.number(".likes") })` on a page showing "41 likes"
- **THEN** `(await PostPage.read(page)).get(Post.likes)` SHALL be `41` typed as `number`

#### Scenario: toJSON gives the layered object
- **WHEN** a page reads `Post({ title: ..., comments: Read.list(...) })` and `Session({ user: ... })`
- **THEN** `toJSON()` SHALL be `{ post: { title, comments: [...] }, session: { user } }`

### Requirement: Reads belong to the Checkpoint
Every page Block with a `read` SHALL register its spec under its Checkpoint when defined. The read of a Checkpoint SHALL
merge the specs of every loaded page Block for it; two specs reading the same key for one Checkpoint SHALL raise
`WG_READ_DUPLICATE` at definition time, naming both Blocks.

#### Scenario: A method's landing page supplies the read
- **WHEN** a Method resolves to `PostOpen` and a page Block for `PostOpen` declares a read
- **THEN** a read taken after that Method SHALL use that page Block's spec

### Requirement: Sessions return the read of where they are
`waygraph auto|browser|pilot read <sessionId> [path]` SHALL detect the session's current Checkpoint and print
`{ page, checkpoint, url, read, missing, methods }` as JSON; with `path` (e.g. `post.comments`) only that part of `read`.
When no Checkpoint is detected, `read` SHALL be `{}` and the output SHALL say to use `dom`. The session snapshot returned
by `send` and `reach` SHALL include `read` and `missing` for the Checkpoint the step landed on.

#### Scenario: An agent sees its action's effect in the send reply
- **WHEN** an agent sends the `like` Method on a post page whose read includes `post.likes` and `post.liked`
- **THEN** the reply SHALL include `read.post.likes` one higher than before and `read.post.liked` as `true`

#### Scenario: A path narrows the output
- **WHEN** `waygraph pilot read <id> post.comments` runs
- **THEN** the output's `read` SHALL contain only `post.comments`

### Requirement: Traits check reads
`Trait.read(key, predicate)` SHALL pass when the read of the Checkpoint the Block resolved to has `key` and
`predicate(value)` returns true. It SHALL fail with a message naming the key and its value (or that it is missing), and
with `WG_READ_UNBOUND` when no loaded page Block reads that key for that Checkpoint.

#### Scenario: A Method verifies through its page's read
- **WHEN** `LikePostBlock` resolves to `PostOpen` with `verify: [Trait.read(Post.liked, (v) => v === true)]`
- **THEN** verify SHALL pass when the post page's `post.liked` read is true and fail naming `post.liked` otherwise

### Requirement: The manifest lists keys and reads
The manifest SHALL list each key namespace and read namespace with its fields and their types as printed by the
TypeScript checker (`"post.likes": "number"`), and each page Block SHALL list the read paths it declares.

#### Scenario: An agent learns what a page can read before reading it
- **WHEN** `waygraph manifest` runs on a project whose post page reads `Post({ title, likes })`
- **THEN** that Block's entry SHALL list `post.title` and `post.likes`, and the read namespaces SHALL give their types
