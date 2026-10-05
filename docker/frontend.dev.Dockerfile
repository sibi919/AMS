# Development image for the existing Vite frontend.
# glibc (Debian) base so the linux-x64-gnu native binaries already pinned in
# package-lock.json (rolldown, lightningcss, oxlint) install without change.
FROM node:24-bookworm-slim

ENV NODE_ENV=development \
    npm_config_update_notifier=false \
    npm_config_fund=false

WORKDIR /app

# Dependencies are installed into the image; docker-compose keeps /app/node_modules
# on a named volume so the bind-mounted source directory stays untouched.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host is required so the gateway can reach the dev server.
# Note: hot module reload connects directly to this port, which is not published
# on the host, so after editing a file refresh the browser. Everything else
# (including on-demand recompilation) works normally.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
