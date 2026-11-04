FROM node:24-alpine

WORKDIR /app

RUN npm install -g @ionic/cli

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --fetch-retries=5 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

COPY . .

EXPOSE 8100

CMD ["ionic", "serve", "--host=0.0.0.0", "--port=8100", "--no-open"]
