# York API environment

The trainer chat API is a second Railway service. Its root is `york-api/`. The static site stays on the root Railway service. Do not add a `start` script to the repository root `package.json`.

## Static site

`YORK_API_HOST` is set on the static site only. Caddy proxies `/api/york/*` to `{$YORK_API_HOST:127.0.0.1:8787}`. Caddy forwards the `X-Real-IP` header it received. It does not replace that header with the proxy address.

## Provider secrets

Each name is optional. A missing secret turns that tier off. The cascade continues to the next tier.

| Name | Tier |
| --- | --- |
| `XAI_API_KEY` | Grok over HTTPS. Model `grok-4.7` unless `XAI_MODEL` is set. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Haiku via the Claude Code CLI. Optional `CLAUDE_BIN`. |
| `CURSOR_API_KEY` | Cursor Auto via the Cursor CLI. Optional `CURSOR_BIN`. |

The Claude child runs in an empty temp directory with `--strict-mcp-config` and an empty MCP config. Its environment contains `PATH`, `HOME`, `TMPDIR`, and `CLAUDE_CODE_OAUTH_TOKEN` only.

The Cursor child uses a fresh temp directory as both its workspace and its `HOME`, so it does not load the host `~/.cursor` config. That directory gets `.cursor/sandbox.json` with `readBoundary` set to `workspace` and an empty `additionalReadPaths` list, plus CLI deny rules for `.env*` and for `/etc`, `/proc`, `/home`, `/root`, `/opt`, `/usr`, `/var`, and `/run`. The command is headless print mode with `--sandbox enabled` and without `--force`. Its environment contains `PATH`, `HOME`, `TMPDIR`, and `CURSOR_API_KEY` only.

Grok is an HTTPS call in the API process. It does not spawn a child.

## Caps

Counts are in memory. A restart clears them. Every chat round counts, including tool rounds where `round` is greater than 0.

| Name | Default | Effect |
| --- | --- | --- |
| `YORK_DAILY_MESSAGE_CAP` | 200 | Requests per client address per UTC day. |
| `YORK_RATE_PER_MINUTE` | 30 | Requests per client address per 60 seconds. |
| `YORK_GLOBAL_DAILY_CAP` | 2000 | Requests for the whole process per UTC day. |
| `YORK_MAX_INFLIGHT` | 4 | LLM and CLI calls running at the same time. |
| `PORT` | 8787 | Listen port. Railway sets this. |

A request over a cap returns the same unavailable sentence as a provider failure. The in-flight slot is released when the call ends. A client disconnect aborts the call, sends `SIGTERM` to a CLI child, then `SIGKILL` after 200 ms. CLI stdout and stderr are capped at 256 KB.

## Client address

The trusted header is `X-Real-IP`. On public Railway ingress the edge replaces that header with the connecting client. The leftmost `X-Forwarded-For` value is never used. If `X-Real-IP` is absent, the rightmost `X-Forwarded-For` hop is the fallback. With neither header, the socket address is the identity.

Private `*.railway.internal` traffic is not sanitized. Do not treat a private-network caller as a browser client.
