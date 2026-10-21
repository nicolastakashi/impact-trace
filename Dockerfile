# The web app only. Collection (./run.sh) stays on your machine, with your Claude Code
# login and claude.ai connectors. Your data stays outside: compose mounts ./data.
FROM oven/bun:1.4.2
USER bun
WORKDIR /app
# React and its peers only: the QA tools stay on your machine.
COPY --chown=bun package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY --chown=bun app app
COPY --chown=bun web web
COPY --chown=bun ingest ingest
COPY --chown=bun db db
ENV HOST=0.0.0.0 COLLECT_ON_HOST=1
EXPOSE 4317
CMD ["bun", "app/server.ts"]
