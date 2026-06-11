# Build stage: install workspace, compile, produce a deployable package
FROM node:22-slim AS build
RUN npm install -g pnpm@10
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @drukar/api build
RUN pnpm --filter @drukar/api --prod deploy /out

# Runtime stage
FROM node:22-slim
WORKDIR /app
COPY --from=build /out /app
ENV NODE_ENV=production \
    DRUKAR_API_PORT=3000 \
    DRUKAR_API_HOST=0.0.0.0 \
    DRUKAR_DATA_DIR=/data
EXPOSE 3000
CMD ["node", "dist/index.js"]
