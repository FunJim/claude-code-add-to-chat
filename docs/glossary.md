# Glossary

## Add to Chat

**Annotation**
An Excerpt the person picked from the conversation, with its Source and an optional Comment, attached to the next prompt they send. Modelled on Codex's "Add to chat".
_Avoid_: quote, highlight, reference

**Excerpt**
The exact text the person selected with the mouse from a transcript row.
_Avoid_: selection (the selection is the transient on-screen highlight; the Excerpt is what is kept)

**Source**
Where an Excerpt came from: a Claude reply (`assistant`), a prompt the person sent (`user`), a tool's row (`tool`), a row of Claude Code's own such as a notice (`system`), or no single row (`transcript`).

**Comment**
Optional words the person attaches to one Annotation, about that Excerpt only.
_Avoid_: note, remark

**Citation**
Claude's reference, in its reply, to one Annotation of the prompt it is answering, by that Annotation's number.
_Avoid_: backlink, footnote

**Annotation Template**
The fixed wording that turns the person's prompt and its Annotations into what the model reads.
