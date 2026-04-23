# Phase 0 placeholder. Replaced by the Next.js app in Phase 1.
# Purpose: serve 200 on /healthz so we can verify the full Caddy -> web path
# without waiting for the real app to be scaffolded.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html

EXPOSE 3000
