FROM node:20-alpine
WORKDIR /app

# ffmpeg + python3 + ca-certificates + curl for yt-dlp (zipapp runs on python3; node 20 handles JS challenges).
# Override YTDLP_URL at build time to pin a specific release, or leave default for latest.
ARG YTDLP_URL=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
RUN apk add --no-cache ffmpeg python3 ca-certificates curl \
  && curl -fsSL "$YTDLP_URL" -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 5177

USER node
CMD ["node", "server/index.js"]
