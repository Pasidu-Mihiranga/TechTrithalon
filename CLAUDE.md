# CLAUDE.md

All project rules for AI agents live in **AGENTS.md** and apply to Claude in full:

@AGENTS.md

## Claude-specific notes

- **Figma**: use the Figma MCP to *read* designs (`get_metadata`, `get_screenshot`, `get_design_context`, `get_variable_defs`). Creating or editing anything in Figma counts as an outward-facing change (AGENTS.md §2): get the owner's approval first, and prefer a new page or file over changing existing frames.
- The live design file is `nfP1ZRvqcF2cJ4cWeZqyvT` (page `412:8554`, "Dispatcher").
- Before implementing a screen from Figma, load the `figma-design-to-code` skill and map the design to the existing tokens and components. Don't paste the generated reference code as-is.
- Java builds need JDK 21: `export JAVA_HOME=$(/usr/libexec/java_home -v 21)`.
- Run `./gradlew test` in `apps/api` (needs Docker for Testcontainers), `pytest` in `apps/intelligence`, and `pnpm --dir apps/web build` for the web app.
- **Endpoints**: after creating or changing any endpoint, rebuild with `docker compose up --build -d api`, then verify it with `curl` as required by AGENTS.md §6. Read the port from `.env` (`API_PORT`), because it may not be 8080 on this machine.
- **File structure**: AGENTS.md §5 fixes where files go. Before creating a new folder, module, package or app, or moving or renaming anything, stop and ask the owner. Don't use `mkdir` to invent a location.
