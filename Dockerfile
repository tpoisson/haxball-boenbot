FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json /app

# https://docs.docker.com/engine/reference/builder/#run---mounttypecache
RUN --mount=type=cache,target=~/.npm,sharing=locked \
  --mount=type=cache,target=~/.npm,sharing=locked \
  npm ci --no-audit --no-fund

COPY tsconfig.json /app/
COPY webpack.config.js /app

COPY src /app/src

RUN npm run build

FROM node:18-alpine

RUN apk --no-cache add chromium

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=3 CMD ps aux | grep [h]axball-server || exit 1

EXPOSE 9500

ENTRYPOINT [ "npx", "haxball-server", "open" ]
CMD ["--file", "config.json"]
