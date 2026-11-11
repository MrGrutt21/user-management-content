# Production image (Next.js `output: "standalone"`).
#
# Run exactly ONE container with ONE Node process: users, clients and sessions live
# in memory. A second replica would have its own users and its own sessions, and a
# restart resets everything to the seed.
#
#   docker build -t user-management .
#   docker run -p 3000:3000 -e DEMO_RESET=true user-management
#
# DEMO_RESET=true (read at runtime) turns on the "Reset demo data" button and lists
# the demo logins on /login. .env.development is for `next dev` only and is not copied.
# COOKIE_SECURE defaults to auto: the session cookie is Secure over HTTPS, including
# behind a TLS-terminating proxy that sends X-Forwarded-Proto: https.

# 1. Dependencies (dev dependencies too: the build needs TypeScript).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Build. Creates .next/standalone (server.js + only the node_modules it needs).
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional and absent today; create it so the COPY below works either way.
RUN mkdir -p public && npm run build

# 3. Runtime: no source, no dev dependencies.
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# The standalone server does not copy static assets or public/; they go next to server.js.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Unprivileged user that ships with the official Node image.
USER node
EXPOSE 3000
CMD ["node", "server.js"]
