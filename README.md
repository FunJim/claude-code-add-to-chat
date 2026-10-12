# add-to-chat

A Claude Code mod modelled on Codex's "Add to chat". In the fullscreen TUI, select text in the transcript (a Claude reply or one of your own prompts), optionally add a comment, and it goes along with your next prompt as a numbered annotation. Claude cites annotations by number, and those citations show as ①②… in its reply.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install add-to-chat --marketplace FunJim/claude-code-add-to-chat
```

Answer `y` to add the marketplace, then pick a scope.

It needs fullscreen mode (`CLAUDE_CODE_NO_FLICKER=1`). Outside fullscreen, Claude Code cannot see the mouse selection; see `docs/adr/0001-fullscreen-only-polled-selection.md`.

## Use

1. Select text in the transcript with the mouse. A band above the prompt shows `[ Add to chat ] "…" ×`. Click the button, or run `/add-to-chat`. Click `×` to ignore the selection.
2. Click the `Add an optional comment…` field, type a comment, and press Enter. Or leave it empty.
3. The annotated text gets a mark like `⁽¹⁾` in the transcript. `▸ N annotations` opens the list, where `×` removes an entry.
4. Send your prompt as usual. In the transcript your message shows as what you typed plus `📎 N annotations`; press ctrl+o to see what the model received. If you have nothing to type, `[ Send ]` puts `(see annotations)` in the prompt for you to send.

## Annotation Template

By default the prompt is rewritten into Codex's format: a JSON array of annotations, then `## My request:` and what you typed. To use your own wording, point the `templatePath` option at a file (in `/plugin` → add-to-chat → configure, or `pluginConfigs` in settings).

Templates use a small Mustache subset:

| Tag | Value |
|---|---|
| `{{request}}` | What you typed. A template **with** it replaces your prompt; a template **without** it is attached as hidden context next to your prompt |
| `{{count}}` | Number of annotations |
| `{{annotations_json}}` | `[{ "text", "source": { "role", "rowId" }, "comment" }]` |
| `{{#annotations}}…{{/annotations}}` | One block per annotation, containing `{{index}}`, `{{text}}`, `{{source}}` (`claude` / `you` / `transcript`), `{{rowId}}`, `{{comment}}` |
| `{{#comment}}…{{/comment}}` | Only rendered when the annotation has a comment (`{{^comment}}` for the opposite) |

An XML-style template that leaves your prompt untouched and goes into context:

```
The user selected these excerpts from earlier in the conversation; their prompt refers to them by number.
{{#annotations}}
<annotation n="{{index}}" source="{{source}}">
<excerpt>{{text}}</excerpt>
{{#comment}}<comment>{{comment}}</comment>{{/comment}}
</annotation>
{{/annotations}}
```

Citations (①②…) only appear if your template asks Claude to write `:annotation{index="N"}`, as the default template does.

## Develop

See `CLAUDE.md`. Specification: `docs/spec.md`; measurements behind the design: `docs/spikes.md`.
