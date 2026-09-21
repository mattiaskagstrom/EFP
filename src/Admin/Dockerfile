FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/Admin/package.json src/Admin/package.json
RUN pnpm install --frozen-lockfile
COPY src/Admin src/Admin
RUN pnpm --filter efp-admin build

FROM nginx:1.27-alpine
COPY src/Admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/src/Admin/dist /usr/share/nginx/html
EXPOSE 80
