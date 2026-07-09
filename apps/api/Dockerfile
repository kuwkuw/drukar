# Build stage: install workspace, compile, produce a deployable package
FROM node:22-slim AS build
RUN npm install -g pnpm@10
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @drukar/api build
# Build the SPA too: the API serves it (DRUKAR_WEB_DIST) so one container is the whole product.
RUN pnpm --filter @drukar/web build
# --legacy: pnpm v10 requires inject-workspace-packages=true without it; tsup already
# bundles @drukar/shared into dist (noExternal), so injection semantics aren't needed.
RUN pnpm --filter @drukar/api --prod deploy --legacy /out

# Runtime stage
FROM node:22-slim
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/web/dist /app/web
ENV NODE_ENV=production \
    DRUKAR_API_PORT=3000 \
    DRUKAR_API_HOST=0.0.0.0 \
    DRUKAR_DATA_DIR=/data \
    DRUKAR_WEB_DIST=/app/web
EXPOSE 3000
CMD ["node", "dist/index.js"]
