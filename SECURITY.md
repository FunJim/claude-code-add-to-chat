# Security

## Reporting a vulnerability

Please report it privately through [GitHub's security advisories](https://github.com/FunJim/claude-code-add-to-chat/security/advisories/new) rather than in a public issue. You can expect an answer within a week.

## What the mod touches

add-to-chat runs inside Claude Code's mod engine, with no Node or network access of its own. It:

- reads the transcript selection and the prompt draft while Claude Code is in fullscreen;
- keeps, in Claude Code's per-plugin store, a record for each rewritten prompt, by its hash, holding the text that was typed and its annotations (the latest 200), so prompt rows draw compactly after `--resume`.

It sends nothing anywhere: what you add goes to the model only as part of the prompt you send.

## Prompt injection through Excerpts

An Excerpt is text from the conversation, which can include text Claude read from files or the web. The Annotation Template puts Excerpts and Comments in XML with `&`, `<`, `>` and `"` escaped, so an Excerpt cannot close the `<annotations>` block and pass itself off as your request. The model still reads what an Excerpt says: an Excerpt holding instructions is as safe to send as the text it came from.
