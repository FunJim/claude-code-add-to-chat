# Security

## Reporting a vulnerability

Please report it privately through [GitHub's security advisories](https://github.com/FunJim/claude-code-add-to-chat/security/advisories/new) rather than in a public issue. You can expect an answer within a week.

## What the mod touches

add-to-chat runs inside Claude Code's mod engine, with no Node or network access of its own. It:

- reads the transcript selection and the prompt draft while Claude Code is in fullscreen;
- reads the template file named by its `templatePath` option, if set;
- keeps, in Claude Code's per-plugin store, a map from each rewritten prompt's hash to the text that was typed (the latest 200), so prompt rows draw compactly after `--resume`.

It sends nothing anywhere: what you add goes to the model only as part of the prompt you send.

## Prompt injection through Excerpts

An Excerpt is text from the conversation, which can include text Claude read from files or the web. The default template puts Excerpts in a JSON array and escapes `<`, `>` and `&` there, so an Excerpt cannot close the `<response-annotations>` block and pass itself off as your request. A custom template that inserts `{{text}}` between tags of its own has no such protection; see the README.
