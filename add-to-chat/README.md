# add-to-chat

Codex's "Add to chat", for Claude Code. Select any text in the transcript (a line of Claude's reply, one of your own earlier prompts, a tool's output), add an optional comment, and it goes with your next prompt as a numbered annotation. Claude answers each one and cites it as ①②… in its reply. Works in the terminal and in the desktop app.

## Requirements

- Claude Code 2.1.300 or later, with mods.
- In a terminal, fullscreen mode: start Claude Code with `CLAUDE_CODE_NO_FLICKER=1`, or set it under `env` in your settings. Outside fullscreen the terminal owns the mouse selection and no mod can read it.
- In the desktop app, Claude Code 2.1.325 or later, for the right-click menu row.

## Install

At the prompt of a Claude Code session:

```
/plugin install add-to-chat --marketplace FunJim/claude-code-add-to-chat
```

## Use

1. Select text in the transcript.
   - Terminal: the line under the prompt offers `[ ✚ Add to chat ]`; click it, or run `/add-to-chat`.
   - Desktop app: right-click the selection and choose `✚ Add to chat`.
2. Each annotation gets a tab in the pane with its excerpt, where it came from, and a Comment field. Leave the comment empty, or type a question about the excerpt.
3. Send your prompt as usual. It shows as what you typed plus `📎 N annotations ↗`, and Claude's reply marks the sentences that answer each annotation.

What the mod reads and sends: only the text you select and the comments you type, added to your own next prompt. It makes no network requests. For your latest 200 prompts sent with annotations, it keeps what you typed and those annotations in the plugin's local store, so a resumed session still shows them.

Full documentation, the Annotation Template and the limitations: <https://github.com/FunJim/claude-code-add-to-chat>

MIT licensed.
