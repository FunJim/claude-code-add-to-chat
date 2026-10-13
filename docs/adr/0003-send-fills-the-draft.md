# `[ Send ]` fills the draft rather than sending

With Annotations pending and an empty prompt, `[ Send ]` puts `(see annotations)` in the draft with `$.prompt.fill`, and the person presses Enter.

Enter on an empty draft raises no `prompt.submit`, so the Annotations can't go with "nothing". And a prompt the mod sends itself with `$.prompt.submit` passes through none of its own hooks: the template is not applied by the normal path, the row is not drawn compact, and it shows as "Prompt from the add-to-chat plugin".

## Considered Options

- **Render the template in the button and `$.prompt.submit({ text, asUser: true })`**: rejected. The transcript shows the whole rendered template under a plugin heading, a template meant for context would have to be pasted into the text (submit takes no `context`), and the mod would duplicate the submit path's clearing.

## Consequences

- Sending without words takes two presses.
- Everything else (template, compact row, clearing the list) goes through the one `prompt.submit` path.
