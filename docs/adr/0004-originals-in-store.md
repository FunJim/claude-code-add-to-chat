# What the person typed, kept in `$.store` by content

When the Annotation Template replaces the prompt, the transcript row would show the whole rendered template. The mod draws the typed text plus `📎 N annotations` instead, and finds the typed text from a map keyed by a hash of the rewritten text, persisted in `$.store`, one record per prompt under `original:<hash>` and one key per reply kept with it under `reply:<hash>:<id>`, and capped at the latest 200.

The row's `props.text` is byte-identical to the rewritten text, while `prompt.submit`'s result carries no message id, so content is the only key available when the row draws. `$.state` is empty in a new process, so without `$.store` a `--resume`d session would show full templates.

## Considered Options

- **Parse `{{request}}` back out of the rendered text using the template**: rejected. A custom template may put the request anywhere, or text around it may repeat it; it breaks as soon as the template file changes.
- **Keep the map in `$.state` only**: rejected; lost on `--resume`.
- **The whole map under one store key** (0.4.0 and earlier): every session loads it and sets it whole, and `$.store` has no compare-and-set, so a session sending after another had written dropped the other's records. - **One record per prompt, a reply added to it by reading, merging and setting it** (0.4.1): two sessions answering the same prompt (a `/branch` sending it again) that both read before either set dropped the first's replies, and a reply let go loses its bound on the Citations.
- **Split 0.4.0's map into records on load**: the keys are read once, so a record another session set after that was set over with the older one.
- **A record per prompt and a key per reply, nothing read to be set again** (chosen): every write sets a key no other write sets differently, so no interleaving of sessions drops one; 0.4.0's map is read under them, never written.

## Consequences

- Two prompts that rendered to the same text share an entry; they would show the same typed text, which is then correct.
- Older rows beyond the 200 kept show the full template, which ctrl+o shows anyway. The cap goes by the store's insertion order; a prompt sent again is deleted and set, so it counts as the newest.
- Loading reads every record (up to 200 `get`s, at once); replies are read from the keys alone.
- 0.4.0's map stays in the store, read and never written: a record of its own key wins over it, and the replies of both add up. It holds 200 records at most.
- A reply a session keeps for a prompt another session has just let go past the cap leaves a key nothing reads, until that prompt is sent again.
