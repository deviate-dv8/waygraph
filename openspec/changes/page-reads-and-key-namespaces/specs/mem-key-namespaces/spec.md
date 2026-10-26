## ADDED Requirements

### Requirement: Mem keys are declared once per namespace
The package SHALL export `keys(namespace)`, which returns a function taking a type argument `T` (an object type) and
returning a key namespace. Reading property `p` of the namespace SHALL give a `MemKey<T[p]>` whose `name` is
`"<namespace>.<p>"`. Reading the same property again SHALL return the same `MemKey` object, so identity-keyed `MemPage`
storage is unchanged. The namespace SHALL NOT be callable and SHALL NOT need its property names listed at runtime.

#### Scenario: A namespace property is a typed MemKey named by its path
- **WHEN** a project declares `const Hopp = keys("hoppscotch")<{ requestUrl: string }>()` and calls
  `mem.set(Hopp.requestUrl, "https://x")`
- **THEN** `mem.get(Hopp.requestUrl)` SHALL return `"https://x"` typed as `string`, and `Hopp.requestUrl.name` SHALL be
  `"hoppscotch.requestUrl"`

#### Scenario: The same property is the same key
- **WHEN** `Hopp.requestUrl` is read in two different files
- **THEN** both reads SHALL return the identical `MemKey` object, and a value set through one SHALL be read through the
  other

#### Scenario: A wrongly typed value does not compile
- **WHEN** a project calls `mem.set(Hopp.requestUrl, 42)` with `requestUrl: string`
- **THEN** TypeScript SHALL report a type error

#### Scenario: Keys work everywhere a MemKey did
- **WHEN** a namespace key is passed to `requires`, `registerMemStub`, `mem.has`, `mem.update` or `--data` JSON (by its
  name)
- **THEN** each SHALL behave exactly as it did for a `key<T>(name)` with the same name

#### Scenario: A namespace is not a promise
- **WHEN** a namespace is awaited or passed to `JSON.stringify`
- **THEN** reading `then` or `toJSON` SHALL return `undefined` rather than a key

### Requirement: key and keyGroup are removed
`key<T>(name)` and `keyGroup<T>(name)` SHALL NOT be exported. `docs/deprecated.md` SHALL list each with its `keys()`
replacement, and the docs drift test SHALL fail on their use in docs, templates or skills.

#### Scenario: The old forms are gone from the public API
- **WHEN** the API surface snapshot test runs
- **THEN** `key` and `keyGroup` SHALL be absent and `keys` SHALL be present

### Requirement: The keys codemod converts a project
`waygraph upgrade --codemod keys` SHALL rewrite, on the TypeScript AST, each file's `key<T>("ns.name")` and
`keyGroup<T>("ns.name")` declarations into one `keys("ns")<{ name: T; ... }>()` per namespace, exported under the
PascalCase of the namespace, and rewrite every use of the old consts across the project. A key name without a dot SHALL
be placed in a namespace named after its file's map group (or file stem), and the codemod SHALL print each such rename,
since that key's `--data` name changes.

#### Scenario: keyGroup uses become plain key uses
- **WHEN** a project has `LoginCreds = keyGroup<{ username: string }>("saucedemo.credentials")` used as
  `mem.set(LoginCreds({ username }))` and `mem.get(LoginCreds.key)`
- **THEN** after the codemod the declaration SHALL be part of `Saucedemo = keys("saucedemo")<{ credentials: {...} }>()`
  and the uses SHALL be `mem.set(Saucedemo.credentials, { username })` and `mem.get(Saucedemo.credentials)`

#### Scenario: A converted project still typechecks and passes
- **WHEN** the codemod runs on the saucedemo example and the scaffold
- **THEN** `tsc --noEmit` and their test suites SHALL pass with no further edits
