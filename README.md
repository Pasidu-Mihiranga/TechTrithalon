# TechTrithalon — Waypoint Operations

TechTrithalon is the repository for Waypoint Operations, a four-role distribution planning and delivery system. The product design and domain rules are documented in [the technical reference](docs/TECHNICAL_REFERENCE.md); work is tracked in [the implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Repository layout

| Path | Purpose |
|---|---|
| `apps/web` | React + TypeScript + Vite client |
| `apps/api` | Java 21 Spring Boot operational API |
| `apps/intelligence` | Python computation service; no operational database access |
| `dataset/data` | Supplied CSV source files |
| `docs` | Implementation plan and technical reference |
| `infrastructure/docker` | Container build definitions |

## Local setup

1. Copy `.env.example` to `.env` and adjust local ports or credentials if needed.
2. Run `docker compose up --build`.
3. Open `http://localhost:5173`. API health is at `http://localhost:8080/actuator/health`; Python health is at `http://localhost:8000/health`.

The foundation supplies service health, a baseline Flyway migration, and reference-data import. Role workflows are tracked in the implementation plan and are not marked complete until tested end to end. The importer reads the five operational CSVs from `dataset/data/General Data` and verifies key counts. It does not load the training files into the operational database.

For local development without containers, use the bundled Gradle wrapper in `apps/api`, `pnpm` for `apps/web`, and Python 3.12 with `pip install -e .` in `apps/intelligence`. The web app expects `VITE_API_BASE_URL=http://localhost:8080/api/v1`.

## GitHub connection

This workspace is initialized with `origin` set to `https://github.com/Pasidu-Mihiranga/TechTrithalon.git`. Fetch and integrate the remote default branch before pushing local commits. No remote changes are made by the scaffold.
