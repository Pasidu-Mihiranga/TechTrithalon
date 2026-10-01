.PHONY: up down reset smoke test api-test python-test web-test web-build gen-api

up:            ## Start the full stack
	docker compose up --build

down:          ## Stop the stack (keeps the database volume)
	docker compose down

reset:         ## Stop the stack AND wipe the database, then start fresh (re-seeds reference data)
	docker compose down -v
	docker compose up --build -d

smoke:         ## Smoke-test an already running stack
	./scripts/smoke.sh

test: api-test python-test web-test web-build

api-test:
	cd apps/api && ./gradlew test

python-test:
	cd apps/intelligence && .venv/bin/python -m pytest

web-test:
	corepack pnpm --dir apps/web lint
	corepack pnpm --dir apps/web typecheck
	corepack pnpm --dir apps/web test

web-build:
	corepack pnpm install --frozen-lockfile
	corepack pnpm --dir apps/web build

gen-api:       ## Regenerate apps/api/openapi.json and the TypeScript client
	cd apps/api && ./gradlew test --tests '*OpenApiContractTest' -PupdateOpenApi
	corepack pnpm --dir apps/web generate:api
