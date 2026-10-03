# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable

# Dependencies first (cached until a package.json or the lockfile changes).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY packages/field-core/package.json packages/field-core/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

COPY packages/design-tokens/ packages/design-tokens/
COPY packages/field-core/ packages/field-core/
COPY apps/web/ apps/web/
ARG VITE_API_BASE_URL=http://localhost:8080
ARG VITE_SEED_DISPATCHER_USERNAME=DSP-001
ARG VITE_SEED_DISPATCHER_PASSWORD=Dispatcher12
ARG VITE_SEED_STORE_MANAGER_USERNAME=STM-001
ARG VITE_SEED_STORE_MANAGER_PASSWORD=StoreManager12
ARG VITE_SEED_LOADER_USERNAME=LDR-001
ARG VITE_SEED_LOADER_PASSWORD=LoaderPass12
ARG VITE_SEED_DRIVER_USERNAME=DRV-001
ARG VITE_SEED_DRIVER_PASSWORD=DriverPass12

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SEED_DISPATCHER_USERNAME=$VITE_SEED_DISPATCHER_USERNAME \
    VITE_SEED_DISPATCHER_PASSWORD=$VITE_SEED_DISPATCHER_PASSWORD \
    VITE_SEED_STORE_MANAGER_USERNAME=$VITE_SEED_STORE_MANAGER_USERNAME \
    VITE_SEED_STORE_MANAGER_PASSWORD=$VITE_SEED_STORE_MANAGER_PASSWORD \
    VITE_SEED_LOADER_USERNAME=$VITE_SEED_LOADER_USERNAME \
    VITE_SEED_LOADER_PASSWORD=$VITE_SEED_LOADER_PASSWORD \
    VITE_SEED_DRIVER_USERNAME=$VITE_SEED_DRIVER_USERNAME \
    VITE_SEED_DRIVER_PASSWORD=$VITE_SEED_DRIVER_PASSWORD

RUN pnpm --dir apps/web build

FROM nginx:1.27-alpine
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
