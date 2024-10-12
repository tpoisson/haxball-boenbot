FROM node:20.18.0-alpine3.20 AS builder

WORKDIR /app

COPY package*.json /app

# https://docs.docker.com/engine/reference/builder/#run---mounttypecache
RUN --mount=type=cache,target=~/.npm,sharing=shared npm ci --no-audit --no-fund

COPY tsconfig.json /app/
COPY webpack.config.js /app

COPY src /app/src

RUN npm run build

FROM node:20.18-bookworm-slim

RUN apt-get update -qq -y && \
    apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils
RUN npx @puppeteer/browsers install chrome@115.0.5790.170

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=3 CMD ps aux | grep [h]axball-server || exit 1

EXPOSE 9500

ENTRYPOINT [ "npx", "haxball-server", "open" ]
CMD ["--file", "config.json"]
