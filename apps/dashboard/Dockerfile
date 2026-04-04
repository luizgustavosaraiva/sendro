FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN corepack enable && corepack prepare pnpm@10.6.2 --activate && pnpm install --frozen-lockfile=false
EXPOSE 3000
CMD ["pnpm", "--filter", "dashboard", "start"]
