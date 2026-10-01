API_GRADLE=./apps/api/gradlew

.PHONY: up down test web-build api-test python-test
up:
	docker compose up --build

down:
	docker compose down

test: api-test python-test web-build

api-test:
	cd apps/api && ./gradlew test

python-test:
	cd apps/intelligence && python3 -m pytest

web-build:
	corepack pnpm install --no-frozen-lockfile
	corepack pnpm --dir apps/web build
