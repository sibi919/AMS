# Optional production-style image: runs the project's own `npm run build`
# (tsc -b && vite build) and serves the produced dist/ with nginx.
FROM node:24-bookworm-slim AS build

ENV npm_config_update_notifier=false \
    npm_config_fund=false

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines VITE_* values at build time, so they must be present here.
# These are the browser-safe publishable values only. Never pass a secret or
# service-role key as a build argument: it would end up inside the bundle.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
