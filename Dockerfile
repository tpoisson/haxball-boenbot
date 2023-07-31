FROM node:18-alpine as builder

WORKDIR /app

ADD package*.json /app
RUN npm ci

ADD tsconfig.json /app/
ADD webpack.config.js /app

ADD src /app/src

RUN npm run build

FROM node:18-bullseye

RUN apt -qq update && apt -qq install --install-recommends chromium -y
RUN npm install haxball-server -g

WORKDIR /app

COPY --from=builder /app/build/* /app/bots/

EXPOSE 9500

CMD ["haxball-server", "open", "--file", "config.json"]
