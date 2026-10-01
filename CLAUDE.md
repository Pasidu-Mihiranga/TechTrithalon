# CLAUDE.md

All project rules for AI agents live in **AGENTS.md** and apply to Claude in full:

@AGENTS.md

## Claude-specific notes

- **Figma**: use the Figma MCP to *read* designs (`get_metadata`, `get_screenshot`, `get_design_context`, `get_variable_defs`). Creating or editing anything in Figma counts as an outward-facing change (AGENTS.md §2): get the owner's approval first, and prefer a new page or file over changing existing frames.
- The live design file is `nfP1ZRvqcF2cJ4cWeZqyvT` (page `412:8554`, "Dispatcher").
- Before implementing a screen from Figma, load the `figma-design-to-code` skill and map the design to the existing tokens and components. Don't paste the generated reference code as-is.
- Java builds need JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.
- Run `./gradlew test` in `apps/api` (needs Docker for Testcontainers), `pytest` in `apps/intelligence`, and `pnpm --dir apps/web build` for the web app.
