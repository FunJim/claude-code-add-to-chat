# The default template: XML data first, indexed, and no "Annotation N"

The default Annotation Template sends the Annotations as XML, each `<annotation>` carrying its `index` and `source` and holding its `<excerpt>` and `<comment>`, values escaped; then a few lines of instructions; then the request in `<request>`. The instructions say what `:annotation{index="N"}` is for (the user's screen shows it as the Annotation's number) and to write it instead of naming "Annotation N". Citations keep the `:annotation{index="N"}` directive.

The earlier default was Codex's: a JSON array (`{{annotations_json}}`), with "Treat items as Annotation 1, Annotation 2, and so on in array order" and N defined as "its one-based array position".

## Evidence

An eval in October 2026, with `claude -p` (no settings, plugins or tools) on haiku and sonnet, rule-graded, about 400 calls in all; small and near ceiling, so it ruled options out rather than ranking close ones:

- Task accuracy did not depend on the format: JSON, escaped XML and Markdown each answered 158 of 158 checks, and no format fell for an Excerpt forging its closing tags.
- The index did: JSON with no index in the data, under wording that said "N being that annotation's index", made haiku number from 0 in every run of a twelve-Annotation case. XML holds `index="1"` in the data.
- The wording drew labels: under "Treat items as Annotation 1…" replies wrote `**Annotation 1**:annotation{index="1"}:` (9 of 34 replies with JSON, 8 with XML, 14 with Markdown); without it, fewer (5 of 34 with XML).
- Markers: `[^N]` added footnote definitions; a bare `①` was used as a list bullet in 8 of 24 Chinese replies; Claude cannot write `<cite …>` (it comes out as `(cite …`). The directive was written right in 23 of 24.
- Anthropic's prompting guidance: XML tags to separate data from instructions, long data first and the query last, and the reason behind an instruction.

## Considered Options

- **Keep Codex's JSON, add an `index` to each item, reword**: works; chosen against because XML needs no explanation of where the index lives and is what Claude's guidance recommends. `{{annotations_json}}` stays for templates that want it.
- **Markdown** (`## Annotation 1`, `>` quotes): most labels, and no way to escape an Excerpt that holds `## My request` or a fence.
- **Another Citation marker** (`[^N]`, `①`, `<cite/>`): ruled out above.

## Consequences

- `{{annotations_xml}}` is new, escaping `&`, `<`, `>` and `"`; README's XML example uses it.
- A Citation is drawn only when its N names an Annotation of the prompt the reply answers, where that is known ([design](../design.md#citations)).
