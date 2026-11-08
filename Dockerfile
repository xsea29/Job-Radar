# JobRadar API + scheduler. Build:  docker build -t jobradar-api .
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
# Fit a 512 MB instance: makes V8 collect harder instead of growing (measured peak ~320 MB for 21 boards vs ~410 MB uncapped).
# If you track many more boards and see out-of-memory restarts, raise this and the plan.
ENV NODE_OPTIONS=--max-old-space-size=320

# Install only what the API needs (manifests first for layer caching).
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/ingest/package.json packages/ingest/
COPY packages/demo/package.json packages/demo/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@jobradar/api --include-workspace-root && npm cache clean --force

COPY packages packages
COPY apps/api apps/api

USER node
WORKDIR /app/apps/api
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/cli/serve.ts"]
