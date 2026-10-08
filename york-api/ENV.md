# York API environment

The trainer chat API is a second Railway service. Its root is `york-api/`. The static site stays on the root Railway service. Do not add a `start` script to the repository root `package.json`.

## Static site

`YORK_API_HOST` is set on the static site only. Caddy proxies `/api/york/*` to `{$YORK_API_HOST:127.0.0.1:8787}`. Caddy forwards the `X-Real-IP` header it received. It does not replace that header with the proxy address.

The york-api service must have no public domain, no TCP proxy, and no other callers. `X-Real-IP` is trusted only when Caddy and the Railway public edge are the only path in. A private `*.railway.internal` caller can spoof that header.

## Provider secrets

Each name is optional. A missing secret turns that tier off. The cascade continues to the next tier.

| Name | Tier |
| --- | --- |
| `XAI_API_KEY` | Grok over HTTPS. Model `grok-4.7` unless `XAI_MODEL` is set. |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Haiku via the Claude Code CLI. Optional `CLAUDE_BIN`. |
| `CURSOR_API_KEY` | Cursor Auto via the Cursor CLI. Optional `CURSOR_BIN`. |

The Claude child runs in an empty temp directory with `--strict-mcp-config` and an empty MCP config. Its environment contains `PATH`, `HOME`, `TMPDIR`, and `CLAUDE_CODE_OAUTH_TOKEN` only.

The Cursor child uses a fresh temp directory as both its workspace and its `HOME`, so it does not load the host `~/.cursor` config. That directory gets `.cursor/sandbox.json` with `readBoundary` set to `workspace` and an empty `additionalReadPaths` list, plus `.cursor/cli-config.json` with `version` 1, `editor.vimMode` false, and CLI deny rules for `.env*` and for `/etc`, `/proc`, `/home`, `/root`, `/opt`, `/usr`, `/var`, and `/run`. The version and vim mode fields stop the CLI from prompting or rewriting the file. The command is headless print mode with `--sandbox enabled` and without `--force`. Its environment contains `PATH`, `HOME`, `TMPDIR`, and `CURSOR_API_KEY` only. Whether an outside read is denied is decided by that CLI, not by a second copy of the policy in this service. The live check is `scripts/real-call-checklist.mjs`.

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
| `YORK_LOG_CLIENT` | off | Set to `1` to log the budget key and round. |

A request over a cap returns the same unavailable sentence as a provider failure. CLI children are spawned detached. A client disconnect sends `SIGTERM` to the whole process group, then `SIGKILL` after 200 ms. The in-flight slot stays held until that process exits. CLI stdout and stderr are capped at 256 KB.

IPv6 clients share one budget key per `/64`. IPv4 addresses stay as written. `::ffff:` addresses use the IPv4 form. Each allow drops rate stamps older than 60 seconds and daily rows from other UTC days.

## CLI image pins

The york-api image installs Claude Code `2.1.295` and Cursor agent `2026.10.01-e373342`. Startup runs `claude --version` and `agent --version` and logs `ready` or `unavailable`. A missing or older binary sets `YORK_CLAUDE_CLI` or `YORK_CURSOR_CLI` to `unavailable` and that tier stays off. The process still starts. A later Cursor date is accepted. The `2026-10-01` build must be hash `e373342`. Claude Code must be at least `2.1.295`.

`YORK_LOG_CLIENT=1` logs the budget key and round on each chat. Leave it off in normal traffic.

## Live checks

Unit tests under `york-api/tests/` are fast guards. They are not verification of a live provider. After deploy, run `scripts/real-call-checklist.mjs` on the API host with `YORK_REAL_CALL=1`. Do not run it with fake keys. It saves the request, response, logs, and `ps` output for each step.

## Client address

The trusted header is `X-Real-IP`. On public Railway ingress the edge replaces that header with the connecting client. The leftmost `X-Forwarded-For` value is never used. If `X-Real-IP` is absent, the rightmost `X-Forwarded-For` hop is the fallback. With neither header, the socket address is the identity.

Private `*.railway.internal` traffic is not sanitized. Do not treat a private-network caller as a browser client.
