FROM node:20-alpine AS build
WORKDIR /app

# argon2's install script is `node-gyp-build`: it tries to load the
# resolved prebuilt binding, that load segfaults on this base image, and
# it FALLS BACK to compiling from source -- nothing here sets
# --build-from-source or npm_config_build_from_source. The source build
# then needs python3/make/g++, and node-gyp fetches headers from
# unofficial-builds.nodejs.org (its musl-path mirror), which times out
# from this environment. The pre-fetch below (official nodejs.org,
# generous retry/timeout) plus npm_config_nodedir supplies those headers
# without relying on that fetch.
#
# Both halves are load-bearing, tested independently: removing the
# toolchain -> `npm ci` fails ("gyp ERR! find Python ... You need to
# install the latest version of Python"). Keeping the toolchain but
# removing the header pre-fetch -> `npm ci` fails ("GET
# https://unofficial-builds.nodejs.org/.../node-v20.20.2-headers.tar.gz"
# -> ETIMEDOUT). Do not remove either without re-proving both stay green.
RUN apk add --no-cache python3 make g++ curl
RUN NODE_VERSION="$(node -v | sed 's/^v//')" \
  && mkdir -p /opt/nodedir \
  && curl -fsSL --retry 5 --retry-delay 3 --max-time 120 \
       -o /tmp/node-headers.tar.gz \
       "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz" \
  && tar -xzf /tmp/node-headers.tar.gz -C /opt/nodedir --strip-components=1 \
  && rm /tmp/node-headers.tar.gz
ENV npm_config_nodedir=/opt/nodedir

COPY package*.json ./
RUN npm ci
COPY . .
# Task 7 review fix (Critical 3): @prisma/client generates nothing until
# this runs against prisma/schema.prisma, which is only present in the
# build context after `COPY . .` above -- `npm ci` alone (before this
# line existed) generated an empty client, and masking.service.ts imports
# `CanonicalField` from it. This compiled before only because the missing
# .dockerignore (Critical 2) smuggled the HOST's already-generated client
# into the image.
RUN npx prisma generate
RUN npm run build
# Drop devDependencies (eslint, jest, typescript, ts-node, ...) but keep
# every already-compiled native addon (argon2) and the generated Prisma
# client exactly as built above -- `npm prune` only removes package
# trees, it never recompiles or regenerates anything, so the runtime
# stage needs no toolchain, no network fetch, and no separate `prisma
# generate` of its own.
RUN npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Prisma's own engine auto-detection shells out to the `openssl`
# CLI to learn which OpenSSL is present; node:20-alpine ships the
# libssl.so.3 shared library but not the `openssl` binary itself, so
# without it Prisma falls back to guessing openssl-1.1.x and loads
# the WRONG generated engine even though the correct
# linux-musl-openssl-3.0.x one (see schema.prisma's binaryTargets) is
# sitting right next to it -- verified while fixing this round's
# Docker Criticals: `node dist/main.js` logged "Error loading shared
# library libssl.so.1.1: No such file or directory" on startup until
# this was added.
RUN apk add --no-cache openssl
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
EXPOSE 4000
CMD ["node", "dist/main.js"]
