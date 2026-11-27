FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1 AS run
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile
COPY --from=build /app/client/dist ./client/dist
COPY server ./server
COPY shared ./shared
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["bun", "server/index.ts"]
