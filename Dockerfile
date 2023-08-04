FROM node:18-alpine as builder

WORKDIR /app

ADD package*.json /app
RUN npm ci

ADD tsconfig.json /app/
ADD webpack.config.js /app

ADD src /app/src

RUN npm run build

FROM node:18-bullseye

# https://docs.docker.com/engine/reference/builder/#run---mounttypecache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  apt -qq update && apt -qq install --install-recommends chromium -y
RUN npm install haxball-server -g

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=3 CMD ps aux | grep [h]axball-server || exit 1

EXPOSE 9500

ENTRYPOINT [ "haxball-server", "open" ]
CMD ["--file", "config.json"]
