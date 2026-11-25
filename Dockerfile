FROM node:20-alpine
WORKDIR /app

# ffmpeg + python3 + yt-dlp (installed unpacked via pip for fast startup on constrained CPU; pip removed afterwards).
# Override YTDLP_PKG (e.g. yt-dlp==2026.11.23) at build time to pin a specific version.
ARG YTDLP_PKG=yt-dlp
RUN apk add --no-cache ffmpeg python3 py3-pip ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages -U "$YTDLP_PKG" \
  && apk del py3-pip

COPY package.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 5177

USER node
CMD ["node", "server/index.js"]
