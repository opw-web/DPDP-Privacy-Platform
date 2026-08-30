FROM node:20-alpine AS build
WORKDIR /app

# argon2 is a real (non-dev) dependency whose bundled prebuilt native
# binaries were found, while verifying this round's Docker fixes, to
# segfault on load in this Node/Alpine combination -- confirmed by
# testing both its musl and glibc prebuilds directly. Forcing a build
# from source via node-gyp is the reliable path, and IS how this actually
# gets exercised: argon2.hash()/verify() round-tripped correctly against
# the source-compiled addon in the same verification.
#
# node-gyp's own header download (from unofficial-builds.nodejs.org) uses
# a short, non-configurable timeout that this environment's link to that
# host cannot reliably meet (confirmed: the same download completes fine
# manually with a generous timeout, in ~20-45s, well past node-gyp's
# internal cutoff). Headers are fetched once, up front, against the
# official nodejs.org distribution, with a generous timeout/retry policy,
# and handed to node-gyp via `--nodedir` (`npm_config_nodedir`) instead of
# letting node-gyp download them itself.
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
