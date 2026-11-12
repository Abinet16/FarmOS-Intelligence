# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @farmos/api... build
# --legacy: copy workspace packages (shared-types) without opting the whole
# workspace into injected dependencies, which pnpm 10+ otherwise requires.
RUN pnpm --filter @farmos/api deploy --prod --ignore-scripts --legacy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/apps/api/dist ./dist
# Generated reports; a named volume mounted here takes this ownership.
RUN mkdir -p var/reports && chown node:node var/reports
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:4000/health/live || exit 1
# The worker runs the same image with: node dist/worker.js
CMD ["node", "dist/main.js"]
