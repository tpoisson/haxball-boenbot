FROM node:lts-alpine as builder

WORKDIR /app

ADD tsconfig.json /app/
ADD package*.json /app
ADD webpack.config.js /app
ADD src /app/src

RUN npm ci

RUN npm run build

FROM node:lts-bullseye

RUN apt -qq update && apt -qq install --install-recommends chromium -y
RUN npm install haxball-server -g

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

EXPOSE 9500

CMD "haxball-server" "open" "-f" "config/config.json"
