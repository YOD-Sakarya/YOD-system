---
name: frontend-design
description: Build distinctive, accessible, production-grade frontend UI for the Yod redesign (React + Vite). Use when creating or restyling pages and components.
---

# Frontend design

Applies to `redesign/src`. Pick a deliberate visual direction before writing code; avoid the generic default look (Inter + purple gradient + identical rounded cards).

## Process
1. State the direction in one line (tone, density, who uses it) before coding.
2. Define tokens first: colors, spacing, radii, type scale as CSS variables in `src/styles/tokens.css`. Never hard-code colors in components.
3. Choose a real type pairing (display + text); the app is Arabic/RTL-capable, so verify glyph coverage and `dir` handling.
4. Build small components, one per file, under `src/components/`; pages under `src/pages/`; hooks under `src/hooks/`.
5. Check the result in the browser at mobile (375px) and desktop widths, in light and dark.

## Rules
- Semantic HTML first; every interactive element keyboard-reachable with a visible focus style.
- Contrast: body text >= 4.5:1, large text >= 3:1.
- Respect `prefers-reduced-motion`; keep motion purposeful (state change, hierarchy), not decorative.
- Layout with CSS grid/flex and logical properties (`margin-inline`, `padding-block`) so RTL works.
- Empty, loading and error states are part of every screen.
- No component over ~150 lines or file with more than one responsibility; extract instead.
