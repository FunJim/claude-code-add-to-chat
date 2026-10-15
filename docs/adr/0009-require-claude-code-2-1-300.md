# Require Claude Code 2.1.300

add-to-chat hooks `prompt.change` to tell how a sent prompt came back into the prompt box: a rewind (`engine`), a step through the prompt history (`history`), an emptied box (`clear`). That event first exists in Claude Code 2.1.300, so the mod requires it.

## Why not both

Measured on 2.1.296, an engine without the event refuses the whole hooks module, not the one hook:

- a plugin has one hooks module (`hooks.json` naming a second is refused), so the hook cannot sit in a module only newer engines load;
- `on()` takes the event as a string literal (a computed name is refused on 2.1.296 and 2.1.300 alike), so it cannot be hooked behind a version check;
- `$.session.version()` would answer the version only once the module runs, which it never does.

## Considered Options

- **Poll the draft instead, on any version.** The poll sees the box's text change but not who changed it, so it must guess: a step through the history from an edit by how much of the text stayed, a rewind from a recall not at all. A paste over the whole text reads as a step through the history and takes the prompt's Annotations out, and the rendered template shows in the box for up to a poll (250 ms) before what was typed replaces it.
- **A second plugin for 2.1.300 alone**, holding the hook: it would have to write add-to-chat's state or call into it, and the person would install two plugins.
- **Require 2.1.300** (chosen): exact, one plugin. 0.2.1, which does not hook the event, stays for earlier versions.

## Consequences

- CI pins 2.1.300; README, CONTRIBUTING and the changelog name it.
- On an earlier version the mod does not load, saying so in the debug log only (a session hot-reloading the folder shows a line in the transcript).
