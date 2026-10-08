# York API environment

The trainer chat API runs on the captain's Mac (`ghost128`), where `grok`, `claude`, and `agent` are already signed in. It does not need `XAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or `CURSOR_API_KEY`. Do not create provider accounts for this service.

`york-api/scripts/install-mac.sh` installs dependencies, writes `~/Library/LaunchAgents/xyz.destroyrebuild.york-api.plist` (`RunAtLoad`, `KeepAlive`, mode `600`), and bootstraps it with `launchctl bootstrap gui/$(id -u)`. The plist contains the proxy secret, so the script sets `umask 077` and `chmod 600` before `launchctl` loads it. The process listens on `127.0.0.1` only.

The process refuses to listen when `YORK_PROXY_SECRET` is unset or shorter than 16 characters. Tests that call `createYorkServer` directly do not take that path.

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
| `X-York-Client-IP` | `{http.request.header.X-Real-IP}` |

`{http.request.header.X-Real-IP}` is the client address the edge already stored. The Railway peer address is one shared hop, so it is not the budget key. Caddy does not strip `X-Real-IP`. It still strips `X-Forwarded-For`. York accepts `X-York-Client-IP` only after `YORK_PROXY_SECRET` matches. The compare is constant-time. A request with the wrong secret gets the same unavailable sentence. An empty `X-Real-IP` leaves the client header empty, and York then uses the socket address.

Set these on the Railway static site. Use the same secret the Mac installer wrote, at least 16 characters.

| Name | Value |
| --- | --- |
| `YORK_API_UPSTREAM` | The Tailscale Funnel origin, including `https://`. |
| `YORK_PROXY_SECRET` | The same secret passed to `install-mac.sh`. |

## Provider CLIs

The cascade is local CLIs, in order. Each tier is skipped when its binary is missing. An older binary logs a warning and stays on. A tier that fails its own launch check stays off.

| Order | Command | Budget |
| --- | --- | --- |
| 1 | `grok` | 45 seconds |
| 2 | `claude --model claude-haiku-5-5` | 25 seconds |
| 3 | `agent -p --model auto` | 30 seconds |
| 4 | `codex exec` | 35 seconds, only when `YORK_CODEX=1` |

45 + 25 + 30 seconds fits under the server deadline of 110 seconds and the trainer abort of 120 seconds. Codex runs only with the time those three left behind. Caddy waits 130 seconds for the upstream response.

This repository's Linux check does not run the grok, claude, agent, or codex binaries. Flag behavior below is from the CLI docs and from the ghost128 install at `811ce7e`. A flag the live binary rejects fails that call, and the cascade moves on. Nothing here pretends a missing binary accepted a flag.

### Grok

Headless grok does not read a prompt on stdin. `grok -p` with a pipe exits 2 because `--single` still wants a value. York writes the prompt to a temp file and passes `--prompt-file`.

Every call also passes `--permission-mode dontAsk`, `--disable-web-search`, `--no-subagents`, `--no-memory`, and `--sandbox york`. Startup leaves the tier off when those permission and sandbox flags are missing.

`dontAsk` does not stop reads. `read_file`, `grep`, `list_dir`, `cat`, `ls`, and `ps` run without a prompt in every permission mode, including `dontAsk`. The block is grok's own sandbox profile `york` plus, on macOS, an outer `sandbox-exec` profile.

`york` extends `strict` and denies `$HOME` (including `~/.ssh`, `~/.config`, `~/.zshrc`, `~/.claude`, `~/.cursor`, `~/Library`, and `~/.grok/hooks`). It allows read of only these auth files when they exist: `~/.grok/auth.json`, `~/.grok/credentials.json`, `~/.grok/.credentials.json`. Built-in profiles, including `strict`, do not deny `~/.ssh`.

There is no documented flag that turns off native `~/.grok/hooks`. York points `GROK_HOME` at the per-call temp directory, writes a fresh `config.toml` (permission `dontAsk`, Claude and Cursor compat off), writes `sandbox.toml`, creates an empty `hooks` directory, and symlinks only the auth files named above. The user's `config.toml` is not copied. Sessions in that temp home are deleted with the directory. `--no-memory` turns off cross-session memory. It does not by itself move the session files.

These environment variables are set to `0` on the child: `GROK_CLAUDE_SKILLS_ENABLED`, `GROK_CLAUDE_RULES_ENABLED`, `GROK_CLAUDE_AGENTS_ENABLED`, `GROK_CLAUDE_MCPS_ENABLED`, `GROK_CLAUDE_HOOKS_ENABLED`, and the five `GROK_CURSOR_*_ENABLED` names of the same shape. A project `.grok/config.toml` cannot turn compat off. It only contributes `[mcp_servers]`, `[plugins]`, and `[permission]`.

`grok --version` prints `grok 1.0.50 (hash) [stable]`. The floor `1.0.50` is read from the triple after the `grok ` prefix. The floor is log-and-warn only.

### Claude

The arguments are `-p`, `--safe-mode`, `--no-session-persistence`, `--model claude-haiku-5-5`, `--strict-mcp-config`, an empty MCP config, `--output-format text`, `--max-turns 1`, and `--tools` empty. The child also sets `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1`, which is the documented any-mode switch. `--no-session-persistence` applies to print mode. A regression in 2.1.105 and later still wrote a small session file for some builds. The captain's floor is `2.1.293`. Whether that build still writes the file, and whether keychain login still works with `--safe-mode`, was not re-checked on this machine. The live checklist is the check.

A reply that is only `<reasoning_effort>` tags is treated as empty, and the cascade moves on. There is no extra effort flag in this launch.

`CLAUDE_CONFIG_DIR` stays on the signed-in home. York does not point it at an empty directory.

### Cursor

`agent` must be the Cursor CLI. At startup York resolves `agent` and `grok`. The Cursor tier stays off when those paths are the same file, or when `agent --version` starts with `grok `. The xAI installer can symlink `agent` to grok. Cursor's own version line looks like `2026.07.17-hash`.

Cursor does not read a `cli-config.json` written into the workspace. It reads `~/.cursor`, `CURSOR_CONFIG_DIR`, or `XDG_CONFIG_HOME`. York sets `CURSOR_CONFIG_DIR` to `<temp>/.cursor` and writes `cli-config.json`, `sandbox.json`, `cli.json`, and an empty `hooks.json` (`{"version":1,"hooks":{}}`) there. Deny rules include `Read(/Users/**)` and `Read(~/**)` in addition to `Read(/home/**)` and the other outside paths. The workspace is `--workspace` on that temp directory, `--mode ask`, `--sandbox enabled`, and no `--force`.

If `~/.cursor/auth.json` or `~/.cursor/cli-auth.json` exists, York symlinks that file into the temp config. It does not copy the user's `cli-config.json` or `hooks.json`. Keychain login under this config directory was not re-checked here. If a live run cannot sign in, link the one auth file the failure names. Do not copy the user's permission file.

No documented flag disables one hook event. `~/.cursor/hooks.json` and Claude-compat hooks in `~/.claude/settings.json` are kept out by `CURSOR_CONFIG_DIR`, the empty `hooks.json`, and the macOS seatbelt deny of those files. Print mode often does not emit `beforeSubmitPrompt`. `sessionStart` can still fire when the hook file is the one Cursor loads.

### Codex

When `YORK_CODEX=1`, the arguments must include `--sandbox` and `--ignore-user-config` or the tier stays off. York passes `--sandbox read-only`. The ghost128 `codex` binary was not executed for this change. If that binary rejects the flag, the call fails and the cascade moves on.

### What each call may touch

On macOS the child is `sandbox-exec -f <temp>/.york.sb -- <cli> ...`. The profile starts from deny-default. It allows exec of that one CLI binary, reads of system libraries, reads and writes of the temp directory, keychain `mach-lookup`, and outbound network so the model API can answer. It denies reads and writes of `/Users` and `$HOME`, then allows read of that CLI's auth files only, then denies again `.ssh`, `.config`, `Library`, `.zshrc`, `Library/LaunchAgents`, `.grok/hooks`, `.cursor/hooks.json`, and `.claude/settings.json`. Linux does not run `sandbox-exec`. The grok `--sandbox york` profile is still applied on every platform.

A CLI that needs a helper binary outside that one exec path fails the call. That failure was not executed against the real binaries here. Keychain access through the seatbelt is also unverified until the live run.

The child keeps `HOME` so a CLI can find its login. `YORK_PROXY_SECRET` and `YORK_CANARY` are removed from the child environment.

`york-api/Dockerfile` does not download a Cursor tarball. There is no checksum to pin. The Mac's installed `agent` is the binary.

## Output

Before a reply is sent, York refuses the whole response when the text contains a private-key header, a passwd line (`root:x:0:0` or `root:*:0:0`), or an obvious token (`sk-`, `xoxb-` and the other `xox*-` forms, `ghp_`, `github_pat_`). The same check covers tool arguments. A configured `YORK_PROXY_SECRET` (16 characters or more) or `YORK_CANARY` (8 characters or more) in the text is also refused. The public body is `The AI chat is not available now.` The refused text is not trimmed and sent.

`X-York-Only` may be `grok`, `claude`, `cursor`, or `codex`. It is honored only after the proxy secret matches. It is not a public switch.

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

CLI children are spawned detached. A client disconnect sends `SIGTERM` to the process group, then `SIGKILL` after 200 ms. A normal exit also sends `SIGKILL` to the group. The in-flight slot stays held until `kill(-pid, 0)` fails with `ESRCH`. A child that calls `setsid` leaves the group, and this kill does not reach it. CLI stdout and stderr are capped at 256 KB.

IPv6 clients share one budget key per `/64`. IPv4 stays as written. IPv4-mapped addresses, including `::ffff:cb00:7105`, use the IPv4 form. NAT64 `64:ff9b::/96` addresses, including a dotted tail, use the IPv4 form. Full budget-map pruning runs on a timer (60 seconds or every 100 requests), not on every request. The current client is still filtered on each request.

Startup runs `--version` for each CLI and passes that CLI only its own probe environment (`PATH`, `HOME`, and that CLI's `*_BIN`). The probe resolves when the process exits. It does not wait on a pipe that a stray child still holds. Minimums are log-and-warn only: Claude Code `2.1.293`, Cursor agent `2026.07.17`, grok `1.0.50`.

`plant.configureFleet` stores `capacityMw` at 0 or above. The trainer sim already clamps the same field in `configureUnits`.

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

Restart the LaunchAgent with `YORK_DAILY_MESSAGE_CAP` equal to `YORK_SERVER_DAILY_CAP` before that run. Each outside-read uses its own client address. An unavailable or capped reply fails that read. It does not pass.

The checklist calls `prepareGrokLaunch`, `prepareClaudeLaunch`, and `prepareCursorWorkspace` so the direct probes use York's launch, not a hand-built argument list. It plants a canary under `~/.ssh` and `~/.config`, asks each tier to read those files, append to `~/.zshrc`, write `~/Library/LaunchAgents`, run `id`, and fetch a local URL. It installs a canary hook and restores the previous hook files afterward. `X-York-Only` forces grok, then claude, then cursor.

Step 9 calls `https://www.destroyrebuild.xyz/api/york/chat`. A 404, a 405, or an empty body is `SKIP`, not `PASS`. Two networks are compared only when `YORK_PEER_BUDGET_KEY` is set from a second client. This host cannot invent that key. A skip is not a pass.
