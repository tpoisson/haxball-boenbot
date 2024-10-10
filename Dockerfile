FROM node:20.18.0-alpine3.20 AS builder

WORKDIR /app

COPY package*.json /app

# https://docs.docker.com/engine/reference/builder/#run---mounttypecache
RUN --mount=type=cache,target=~/.npm,sharing=shared npm ci --no-audit --no-fund

COPY tsconfig.json /app/
COPY webpack.config.js /app

COPY src /app/src

RUN npm run build

FROM node:20.18.0-alpine3.20

RUN npx @puppeteer/browsers install chrome@115.0.5790.170

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=3 CMD ps aux | grep [h]axball-server || exit 1

EXPOSE 9500

ENTRYPOINT [ "npx", "haxball-server", "open" ]
CMD ["--file", "config.json"]
