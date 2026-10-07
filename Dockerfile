# Always-on Cutroom team server (any VM, home server, Fly.io, Render, Railway…).
#   docker build -t cutroom .
#   docker run -d -p 4317:4317 -v cutroom-data:/data -e CUTROOM_PUBLIC_URL=https://video.example.com cutroom
# The invite link is printed in the logs (docker logs <container>) and stored in /data/team.json;
# set CUTROOM_TOKEN to choose the invite code yourself. Put it behind HTTPS (a reverse proxy or the platform's TLS).
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production CI=1
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY skill ./skill
RUN npm ci --no-fund --no-audit --include=dev \
 && (npm install-scripts approve esbuild ffmpeg-static 2>/dev/null || true) \
 && npm rebuild esbuild ffmpeg-static \
 && cd apps/web && npx vite build

ENV HOST=0.0.0.0 PORT=4317 CUTROOM_STATIC=1 CUTROOM_DATA=/data
VOLUME /data
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4317/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
