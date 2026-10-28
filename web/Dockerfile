# The web version of Quran Association Manager. Build from the repository root:
#   docker build -f web/Dockerfile -t quran-association-manager-web .
# (docker compose -f web/docker-compose.yml up does it for you.)

# ---- Build the browser app ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: the desktop's postinstall rebuilds native modules for Electron.
RUN npm ci --ignore-scripts
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY . .
RUN cd web && npm run build:client

# ---- Runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
COPY web/server ./web/server
COPY --from=build /app/web/dist ./web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "web/server/index.js"]
