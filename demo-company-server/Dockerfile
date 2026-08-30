FROM node:20-alpine

# better-sqlite3 is a native module. Alpine's node images do not ship a C++
# toolchain, so if the prebuilt binary for this platform/arch isn't
# available on npm's registry, npm falls back to compiling from source,
# which needs python3/make/g++. Installing them here keeps `npm install`
# working in both cases without guessing which one will happen at build
# time (the platform's Dockerfile hit the equivalent issue with argon2).
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 5001

CMD ["node", "dist/server.js"]
