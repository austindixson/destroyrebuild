# York API environment

The trainer chat API runs on the captain's Mac (`ghost128`), where `grok`, `claude`, and `agent` are already signed in. It does not need `XAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or `CURSOR_API_KEY`. Do not create provider accounts for this service.

`york-api/scripts/install-mac.sh` installs dependencies, writes `~/Library/LaunchAgents/xyz.destroyrebuild.york-api.plist` (`RunAtLoad`, `KeepAlive`), and bootstraps it with `launchctl bootstrap gui/$(id -u)`. The process listens on `127.0.0.1` only.

Publish that port with Tailscale Funnel:

```sh
tailscale funnel --bg 8787
```

## Static site

The Railway static site is the public edge. Caddy proxies `/api/york/*` to `{$YORK_API_UPSTREAM}`. When that variable is unset, the upstream dial fails and Caddy answers with the honest sentence: `The AI chat is not available now.`

Caddy sets two headers on the upstream request:

| Header | Value |
| --- | --- |
| `X-York-Proxy-Secret` | `{$YORK_PROXY_SECRET}` |
| `X-York-Client-IP` | `{remote_host}` |

The Mac process accepts `X-York-Client-IP` only after `YORK_PROXY_SECRET` matches. The compare is constant-time. `X-Real-IP` and `X-Forwarded-For` are not a client identity. A request with the wrong secret gets the same unavailable sentence.

Set these on the Railway static site:

| Name | Value |
| --- | --- |
| `YORK_API_UPSTREAM` | The Tailscale Funnel origin, including `https://`. |
| `YORK_PROXY_SECRET` | The same secret passed to `install-mac.sh`. |

## Provider CLIs

The cascade is local CLIs, in order. Each tier is skipped when its binary is missing. An older binary logs a warning and stays on.

| Order | Command | Notes |
| --- | --- | --- |
| 1 | `grok -p` | Prompt on stdin. Optional `GROK_BIN`. |
| 2 | `claude --model claude-haiku-5-5` | `--strict-mcp-config`, empty MCP config, `--tools` empty. Optional `CLAUDE_BIN`. |
| 3 | `agent -p --model auto` | Ask mode, `--sandbox enabled`, no `--force`. Optional `CURSOR_BIN`. |
| 4 | `codex exec` | Off unless `YORK_CODEX=1` and the `codex` binary exists. |

Each call uses a fresh temp directory as its working directory. Cursor also uses that directory as `--workspace`, with `readBoundary` set to `workspace` and deny rules for `.env*`, keys, and `/etc`, `/proc`, `/home`, `/root`, `/opt`, `/usr`, `/var`, and `/run`. The child keeps the signed-in user's environment, including `HOME`, so the CLI can use its own login. `YORK_PROXY_SECRET` is removed from the child environment.

Startup runs `--version` for each CLI and passes that CLI only its own probe environment (`PATH`, `HOME`, and that CLI's `*_BIN`). The probe resolves when the process exits. It does not wait on a pipe that a stray child still holds. Minimums are log-and-warn only: Claude Code `2.1.293`, Cursor agent `2026.07.17`, grok `1.0.50`.

## Caps

Counts are in memory. A restart clears them. Every chat round counts, including tool rounds where `round` is greater than 0.

| Name | Default | Effect |
| --- | --- | --- |
| `YORK_DAILY_MESSAGE_CAP` | 200 | Requests per client address per UTC day. |
| `YORK_RATE_PER_MINUTE` | 30 | Requests per client address per 60 seconds. |
| `YORK_GLOBAL_DAILY_CAP` | 2000 | Requests for the whole process per UTC day. |
| `YORK_MAX_INFLIGHT` | 4 | LLM and CLI calls running at the same time. |
| `PORT` | 8787 | Listen port. |
| `YORK_BIND_HOST` | `127.0.0.1` | Listen address. Keep this on loopback. |
| `YORK_LOG_CLIENT` | off | Set to `1` to log the budget key and round. The Mac installer sets it to `1`. |

A request over a cap returns the same unavailable sentence as a provider failure. At 80% of a daily cap the answer includes `The daily trainer chat limit is close.`

CLI children are spawned detached. A client disconnect sends `SIGTERM` to the process group, then `SIGKILL` after 200 ms. A normal exit also sends `SIGKILL` to the group. The in-flight slot stays held until `kill(-pid, 0)` fails with `ESRCH`. CLI stdout and stderr are capped at 256 KB.

IPv6 clients share one budget key per `/64`. IPv4 stays as written. IPv4-mapped addresses, including `::ffff:cb00:7105`, use the IPv4 form. NAT64 `64:ff9b::/96` addresses, including a dotted tail, use the IPv4 form. Full budget-map pruning runs on a timer (60 seconds or every 100 requests), not on every request. The current client is still filtered on each request.

## Live checks

Unit tests under `york-api/tests/` are fast guards. They are not acceptance. Acceptance is `scripts/real-call-checklist.mjs` on ghost128, with the real CLIs and no provider keys:

```sh
YORK_REAL_CALL=1 \
YORK_API_BASE=http://127.0.0.1:8787 \
YORK_PROXY_SECRET=... \
YORK_CANARY=... \
YORK_SERVER_DAILY_CAP=5 \
node scripts/real-call-checklist.mjs
```

Restart the LaunchAgent with `YORK_DAILY_MESSAGE_CAP` equal to `YORK_SERVER_DAILY_CAP` before that run. Step 9 calls `https://www.destroyrebuild.xyz/api/york/chat`. It does not send the spoof to loopback.
