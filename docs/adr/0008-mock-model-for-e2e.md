# The end-to-end suite talks to a mock model by default

`npm run e2e` points every Claude Code session it starts at a scripted stand-in for the Messages API on a local port ([`e2e/harness/mock-model.ts`](../../e2e/harness/mock-model.ts)), through the `ANTHROPIC_BASE_URL` of the `--settings` it launches with. The mock reads what a scenario sends and streams a reply: a Read or Bash call where the prompt asks for one, a sentence ending in a Citation for each Annotation in the turn, a summary for a compaction. `--model haiku` runs the same scenarios against the real model, and only then asserts what the model made of the template (that it acted on a Comment, read an Excerpt). CI runs the tmux scenarios on the mock.

## Why

- What the suite checks is the mod: what the person sees, what the model is sent, what is drawn from the reply. A reply that is the same on every run tests that better than one that varies a little.
- No login and no API key: the suite runs in CI, and a contributor needs no account to run it.
- Faster (the model scenario takes 20 s instead of 35 s) and free.
- A script can make what a real model seldom does: a reply that streams in small pieces, a turn that takes a set time.

Whether the model understands the template is the eval's question ([ADR 0007](0007-xml-default-template.md)), and `--model haiku`'s.

## Considered Options

- **Keep the real model for every run**: a few cents a run, but no CI, a login to run it, and replies that vary.
- **Record real replies and replay them by request**: the requests hold paths, times and session ids, so matching them needs a normalisation as fragile as a script, and the recordings need re-recording after every change to the template.
- **Answer by a marker in the prompt** (`MODEL-REQ-N`): ties the mock to each scenario's wording. The mock answers by what the prompt asks (read a file, run a command) and by the Annotations it holds, so a new scenario mostly needs no script.

## Consequences

- The mock must follow the requests Claude Code sends: a context `role: "system"` message after the prompt, side calls for the session title and a prompt suggestion, the compaction instruction beside the last tool result ([notes](../claude-code-notes.md#talking-to-a-model-for-the-test-harness)). After a Claude Code update, run `npm run e2e -- --model haiku` once as well.
- A run keeps what the mock was sent and answered in `model-requests.jsonl` beside its report, keys and tokens left out.
