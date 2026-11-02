# Documentation set

| File | Audience | Language |
| --- | --- | --- |
| `../AGENTS.md` (+ `../CLAUDE.md`) | AI coding agents: architecture, rules, API, conventions, backlog | English |
| `YOD-system-guide-ar.pdf` | People: how the system works, roles, workflows, security, limits | Arabic |
| `YOD-presentation-users-ar.pptx` | Members: how to use the system (**no developer role**) | Arabic |
| `YOD-presentation-full-ar.pptx` | Everything incl. the developer role, operations and architecture | Arabic |

## Keeping them current

When behaviour changes (a role, a permission, a workflow, a limit), update in the same change:

1. `AGENTS.md` (the source of truth, sections 7-9 and 12 especially);
2. the text in `src/guide-ar.html` and the slides in `src/build-decks.mjs`;
3. regenerate the three files below.

## Regenerate

```bash
# PDF (Chrome or Edge, headless; run from the repository root)
chrome --headless=new --no-pdf-header-footer --print-to-pdf=docs/YOD-system-guide-ar.pdf docs/src/guide-ar.html

# Decks (installs the generator libraries without touching package.json)
npm i --no-save pptxgenjs react-icons react react-dom sharp
node docs/src/build-decks.mjs
```

Notes
- Arabic text is shaped by Chrome (PDF) and by PowerPoint (decks); decks use Arial, which has Arabic glyphs on every platform.
- In PowerPoint text, put paragraph settings (direction, alignment, bullet) on the **first run of a paragraph only**,
  otherwise pptxgenjs writes a second paragraph block that drops the right-to-left direction (see `Deck.bullets`).
- Check the decks by opening them in PowerPoint (or exporting slides to PNG) after every change; the members deck must never mention the developer role.
