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

A one-row band sits above the prompt: `▎ select text in the transcript to add it to chat`.

1. Select text in the transcript with the mouse: the band's row becomes `[ ✚ Add to chat ] "…" ✕ ignore`. Click the button, or run `/add-to-chat`.
2. Click the `Add an optional comment…` field, type a comment, and press Enter. Or leave it empty.
3. The annotated text gets a mark like `⁽¹⁾` in the transcript. `📎 N annotations ▸` at the right of the band opens the list, where `✕` removes an entry.
4. Send your prompt as usual. In the transcript your message shows as what you typed plus `📎 N annotations`; press ctrl+o to see what the model received. If you have nothing to type, `[ Send ]` puts `(see annotations)` in the prompt for you to send.

The band keeps one row whatever you select. A band that grew when text got selected would push the transcript up under a mouse still dragging, and the selection would jump a line.

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

Values are inserted as-is, apart from `{{annotations_json}}`, which escapes `<`, `>` and `&` so an Excerpt can't close the surrounding tags. If you write a tag-based template, keep in mind that an Excerpt containing `</excerpt>` can break out of it.

Citations (①②…) only appear if your template asks Claude to write `:annotation{index="N"}`, as the default template does.

## Develop

```sh
npm test             # unit tests (claude plugin test)
npm run e2e          # end-to-end showcase in real Claude Code sessions: see e2e/README.md
```

See `CLAUDE.md`. Specification: `docs/spec.md`; measurements behind the design: `docs/spikes.md`; the end-to-end harness: `e2e/README.md`.
