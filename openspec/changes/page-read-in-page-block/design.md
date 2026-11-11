## Decisions
### D1. Types are inferred from `read`
The return type of `read` is the page's read type; `Page.read.<field>` are typed Keys over it. Nothing to declare twice.
### D2. The cycle (a Page Block imports Methods whose verify reads fields)
Methods stay lazy (`() => Block`) and fields are reached through the page at use time (after import): see the
lifecycle guide ("Why `() => Block`"). A Method file imports its page's *type*, not a value, where it can.
### D3. The Read Block kind goes
No alias kept (one way to write it); the codemod and the deprecated page carry projects over.
### D4. Lifecycle unchanged
Read runs on the landing page after `expect`, as documented in "How a run works".
## Risks
- Many files change in a project at once → the codemod, a dry run first, `waygraph check` lists what's left.
