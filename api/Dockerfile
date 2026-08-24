# ── Build ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# openssl is required by Prisma's engines on Alpine.
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma
# Full install (dev deps needed to compile TypeScript). `npm ci` needs the
# lockfile, which keeps builds reproducible.
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# Drop dev dependencies from what we carry forward.
RUN npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package*.json ./

# Uploads are written here when using the local-disk storage provider. Mount a
# volume over it, or switch to S3 — a container filesystem is ephemeral and
# attachments would vanish on redeploy.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
VOLUME ["/app/uploads"]

# Never run as root.
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
