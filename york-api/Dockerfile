FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

ARG CLAUDE_CODE_VERSION=2.1.295
ARG CURSOR_CLI_VERSION=2026.10.01-e373342

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

RUN mkdir -p /opt/cursor-agent \
  && curl -fsSL "https://downloads.cursor.com/lab/${CURSOR_CLI_VERSION}/linux/x64/agent-cli-package.tar.gz" \
    | tar --strip-components=1 -xz -C /opt/cursor-agent \
  && ln -sf /opt/cursor-agent/cursor-agent /usr/local/bin/agent \
  && ln -sf /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data

ENV NODE_ENV=production
EXPOSE 8787
CMD ["npm", "start"]
