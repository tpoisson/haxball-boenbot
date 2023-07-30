FROM node:18-alpine as builder

USER node

WORKDIR /app

ADD --chown=node:node tsconfig.json /app/
ADD --chown=node:node package*.json /app
ADD --chown=node:node webpack.config.js /app
ADD --chown=node:node src /app/src

RUN npm ci

RUN npm run build

FROM node:18-bullseye

RUN apt -qq update && apt -qq install --install-recommends chromium -y
RUN npm install haxball-server -g

USER node

WORKDIR /app

COPY --chown=node:node --from=builder /app/build/* /app/bots/

EXPOSE 9500

CMD ["haxball-server", "open", "--file", "config/config.json"]
