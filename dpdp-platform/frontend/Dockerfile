# Development-mode image for docker-compose's `frontend` service.
# The platform is developed against the host dev server (`npm run dev` on
# 5173); this image exists so `docker compose up` also has a frontend
# container available, running the same Vite dev server with hot reload.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
