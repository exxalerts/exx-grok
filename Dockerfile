FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 5177

USER node
CMD ["node", "server/index.js"]
