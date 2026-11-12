# SPDX-FileCopyrightText: 2026 Junctura Contributors
# SPDX-License-Identifier: Apache-2.0

# Stage 1: install libraries from the lockfiles and build the web interface.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY web/package.json web/package-lock.json web/
RUN npm --prefix web ci
COPY web web
RUN npm run build

# Stage 2: a small runtime image with the server, its production libraries and the built interface.
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5181 \
    CLINIC_DB=/data/clinic.db \
    JUNCTURA_HEALTH_DIR=/junctura-health
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY package.json ./
COPY server server
COPY --from=build /app/web/dist web/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 5181
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:5181/api/config').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server/main.mjs"]
