FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=5173 DATA_DIR=/app/data
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node catalogue ./catalogue
USER node
EXPOSE 5173
CMD ["node", "server/index.mjs"]
