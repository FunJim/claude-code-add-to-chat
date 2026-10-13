# What the person typed, kept in `$.store` by content

When the Annotation Template replaces the prompt, the transcript row would show the whole rendered template. The mod draws the typed text plus `📎 N annotations` instead, and finds the typed text from a map keyed by a hash of the rewritten text, persisted in `$.store` and capped at the latest 200 entries.

The row's `props.text` is byte-identical to the rewritten text, while `prompt.submit`'s result carries no message id, so content is the only key available when the row draws. `$.state` is empty in a new process, so without `$.store` a `--resume`d session would show full templates.

## Considered Options

- **Parse `{{request}}` back out of the rendered text using the template**: rejected. A custom template may put the request anywhere, or text around it may repeat it; it breaks as soon as the template file changes.
- **Keep the map in `$.state` only**: rejected; lost on `--resume`.

## Consequences

- Two prompts that rendered to the same text share an entry; they would show the same typed text, which is then correct.
- Older rows beyond the 200 kept show the full template, which ctrl+o shows anyway.
