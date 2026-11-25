# Anti-slop review

Reviewed 2026-11-25 with `apps/web/e2e/anti-slop.spec.ts`: nine screens at 320, 390 and 1440 px, with motion both on and off (54 captures), plus a reduced-motion assertion. Every capture asserts no document-level horizontal scroll.

## Ten checks

1. **No dashboard/sidebar/tile/chart/glass/purple/icon-soup language — PASS.** Single reading columns, paper wells, slips and stamps. The only repeating gradient is the specified CAREFUL stamp hatch. Demo samples and Shoebox use the task-specified grids, not dashboard tiles.
2. **Tokens only — PASS.** Colour, type, space, shape and motion values come from `styles/tokens.css`. T37 darkened `--ink-3` from `#6e7584` to `#646b78` so meta text passes 4.5:1 on paper. The checks-table stripe now uses `--paper-2` directly.
3. **Real synthetic content — PASS.** Captures use Ruth, Riverbend, Maple, the Nov 18 bill, the Dec 9 second notice and the actual held-out proof summary; no lorem ipsum or generic names.
4. **Stamps and slips are the only decoration — PASS.** No avatars, robots, sparkle icons or ornamental cards.
5. **Loading, empty and error states — PASS.** `docs/states.md` links ten state captures, including skeletons, empty Today, provider timeout, retake, expired link and rate limits.
6. **320/390/1440 and no horizontal page scroll — PASS.** All 54 captures assert `scrollWidth <= innerWidth`. Wide proof/check tables scroll inside their own containers.
7. **Contrast — PASS.** `node scripts/contrast.mjs` checks 15 foreground/background token pairs at ≥4.5:1. Lowest is `--ink-3` on `--paper` at 4.76:1.
8. **Keyboard, focus and images — PASS.** Every action is a native button/link/input; `:focus-visible` is global; file inputs have visible labels and focus-within; letter images have descriptive alt text; decorative sample thumbnails use empty alt.
9. **Reduced motion — PASS.** Stamp, thread and skeleton animations are disabled under `prefers-reduced-motion`; the E2E suite asserts the stamp animation name is `none`.
10. **Designed for Ruth and Sarah — PASS.** Large-type Mom page, plain result sentences, family-only probabilities, calm paper hierarchy and no component-library styling.

## Fixes made in this pass

- Darkened `--ink-3` to meet contrast on paper.
- Made slip titles and metadata block-level so they no longer run together on Case/Letter screens.
- Replaced the derived checks-table stripe with the exact `--paper-2` token.

## Screenshots

- Contact sheets: `screens/anti-slop-contact-320-on.jpg`, `screens/anti-slop-contact-320-off.jpg`, `screens/anti-slop-contact-390-on.jpg`, `screens/anti-slop-contact-390-off.jpg`, `screens/anti-slop-contact-1440-on.jpg`, `screens/anti-slop-contact-1440-off.jpg`.
- Individual captures: `screens/anti-slop-<screen>-<320|390|1440>-<on|off>.png` for `home`, `login`, `today`, `case`, `letter`, `mom`, `proof`, `demo`, and `shoebox`.
