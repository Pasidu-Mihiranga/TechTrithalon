# @techtrithalon/design-tokens

Visual tokens for the whole product, extracted from Figma.

| | |
|---|---|
| Source file | Figma `nfP1ZRvqcF2cJ4cWeZqyvT`, page `412:8554` |
| Extracted with | `get_variable_defs` on nodes `74:5232` (Dashboard) and `30:3416` (Exceptions triage) |
| Source of truth | [`tokens.json`](tokens.json) |
| Generated | `tokens.css` (CSS variables + `.text-*` classes) and `tokens.ts` (typed constants) |

**Edit `tokens.json`, then run `pnpm --dir packages/design-tokens build`.** Never edit the generated files; CI fails if they are stale.

## Notes

- Letter spacing in Figma is a percentage (Overline `6`, Display `-2`); the generator converts it to `em`.
- `layout` values (sidebar 248 px, nav item 40 px) are measured from frame `591:7080`. `topBarHeight` (72 px) is measured from the dashboard frame.
- **Breakpoints are not in Figma.** `tablet 768`, `desktop 1024`, `wide 1280` are derived for the responsive requirement and need design review.
- Fonts: Geist, Geist Mono and Plus Jakarta Sans, self-hosted through `@fontsource` in the web app.

## Screens still without Figma frames

Store Manager (10 screens), Loader (6) and Driver (16) exist only as written rationales in the Figma file. They are built from these tokens and the shared components, and are marked for design review.
