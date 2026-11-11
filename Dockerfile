# AdviseSlot application image (Lab 5, SDS section 9, NFR-09).
# One container: Express serves the API and the built React client on PORT (default 3000).
# All configuration comes from environment variables; no .env file is copied in.
#
#   docker build -t adviseslot .
#   docker compose --profile app up --build      # with the local database (README)

ARG NODE_VERSION=24

# 1. Build the client (Vite writes client/dist).
FROM node:${NODE_VERSION}-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2. Build the server (tsc writes server/dist) and generate the Prisma client.
FROM node:${NODE_VERSION}-slim AS server-build
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate && npm run build

# 3. Runtime image.
FROM node:${NODE_VERSION}-slim AS runtime
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app/server
# node_modules keeps the dev tools on purpose: `npx prisma migrate deploy` and
# `npx prisma db seed` (tsx) run from this same image during a deploy.
COPY --from=server-build /app/server/package.json /app/server/package-lock.json ./
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/prisma ./prisma
# The seed imports the domain rules from src.
COPY --from=server-build /app/server/src ./src
# app.ts serves ../../client/dist relative to server/dist, i.e. /app/client/dist.
COPY --from=client-build /app/client/dist /app/client/dist

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
