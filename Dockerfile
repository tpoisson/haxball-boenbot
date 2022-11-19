FROM node:lts-alpine as builder

WORKDIR /app

ADD tsconfig.json /app/
ADD package*.json /app
ADD src /app/src

RUN npm ci

RUN npm run build

FROM node:lts-buster

RUN apt -qq update && apt -qq install --install-recommends chromium -y
RUN npm install haxball-server -g

USER node

WORKDIR /app

COPY --chown=node:node --from=builder /app/build/* /app/bots/

ADD config.json /app/

EXPOSE 9500

CMD "haxball-server" "open" "-f" "config.json"
