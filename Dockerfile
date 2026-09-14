# syntax=docker/dockerfile:1.7

FROM node:22.22.0-bookworm-slim AS build

ENV CI=true
WORKDIR /app

RUN corepack enable && corepack install --global pnpm@10.33.0

COPY package.json ./package.json
COPY web/package.json web/pnpm-lock.yaml web/.npmrc ./web/

RUN --mount=type=cache,id=ai-newspaper-pnpm,target=/pnpm/store \
    pnpm --dir web install --frozen-lockfile \
      --store-dir=/pnpm/store \
      --registry=https://registry.npmjs.org

COPY web ./web

RUN pnpm --dir web build

FROM node:22.22.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    WRANGLER_WRITE_LOGS=false \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app
RUN corepack enable && corepack install --global pnpm@10.33.0

COPY package.json ./package.json
COPY --from=build --chown=node:node /app/web/package.json ./web/package.json
COPY --from=build --chown=node:node /app/web/pnpm-lock.yaml ./web/pnpm-lock.yaml
COPY --from=build --chown=node:node /app/web/node_modules ./web/node_modules
COPY --from=build --chown=node:node /app/web/dist ./web/dist
COPY --from=build --chown=node:node /app/web/db ./web/db
COPY --from=build --chown=node:node /app/web/lib ./web/lib
COPY --from=build --chown=node:node /app/web/drizzle ./web/drizzle
COPY --from=build --chown=node:node /app/web/drizzle.config.ts ./web/drizzle.config.ts
COPY --from=build --chown=node:node /app/web/tsconfig.json ./web/tsconfig.json

WORKDIR /app/web
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["pnpm", "exec", "vinext", "start", "--port", "3000"]
