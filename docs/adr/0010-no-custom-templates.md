# No custom templates

Every prompt sent with Annotations goes with one Annotation Template, the built-in one ([ADR 0007](0007-xml-default-template.md)). The `templatePath` option, which named a file in a Mustache subset to word it otherwise, is gone; a setting left over is ignored.

## Why

A template of the person's own failed without a word, and the person saw nothing wrong: the prompt row draws what was typed and `📎 N annotations` whatever the model read; only ctrl+o shows it.

- A mistyped closing tag (`{{/annotation}}`) was ignored, so the rest, `{{request}}` with it, repeated once per Annotation.
- `{{request}}` only inside a section that did not render (`{{#comment}}…{{/comment}}` at the top level) replaced the prompt with nothing of it.
- A template without any Annotation field, or an empty file, sent none of them.
- Mustache's own `{{{x}}}`, `{{& x}}` and `{{! comment}}` came out as stray braces, as a template taken for one without `{{request}}`, and as text sent to the model.
- Values inside `{{#annotations}}` went in as they were, so an Excerpt from a tool result could close tags the template wrote around it and pass itself off as the request.
- A template without `{{request}}` went beside the prompt as context and left no original: no 📎 row, no place in the history, no Annotations back on ↑ or a rewind, no bound on the Citations.

## Considered Options

- **Validate the template on load** (unclosed sections, unknown tags, `{{request}}` only in sections, no Annotation field), toast and fall back to the built-in one, and accept `{{{x}}}`, `{{& x}}` and comments: catches the slips, not the context template's missing features nor the injection through sections, and keeps a parser, its rules and its documentation for a setting few would change.
- **Keep it and document the pitfalls**: the failures stay silent.
- **Remove it** (chosen): the built-in template was chosen by an eval over haiku and sonnet, and how Claude should treat the Annotations can still be said in the prompt itself.

## Consequences

- The built-in template renders byte for byte as before, so prompts already sent keep their 📎 rows, history and recall: `originals` is keyed by the rendered text's hash.
- `send.ts` always rewrites the prompt; `template.ts` holds the one template, no parser. The `fs.read` and `env.get` calls are gone.
- Someone who set `templatePath` gets the built-in template, with nothing to say so but the changelog.
