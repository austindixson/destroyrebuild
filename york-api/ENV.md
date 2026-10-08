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

`{http.request.header.X-Real-IP}` is the client address the edge already stored. The Railway peer address is one shared hop, so it is not the budget key. Caddy does not strip `X-Real-IP`. It strips `X-Forwarded-For` and `X-York-Only` (`request_header -X-York-Only`) before the proxy. York accepts `X-York-Client-IP` only after `YORK_PROXY_SECRET` matches, and only when `net.isIP` accepts that one value. A repeated header, a comma-joined list, a non-IP, or a missing header is rejected. York does not use the socket address for that request. The compare is constant-time. A request with the wrong secret gets the same unavailable sentence.

Set these on the Railway static site. Use the same secret the Mac installer wrote, at least 16 characters.

| Name | Value |
| --- | --- |
| `YORK_API_UPSTREAM` | The Tailscale Funnel origin, including `https://`. |
| `YORK_PROXY_SECRET` | The same secret passed to `install-mac.sh`. |

## Provider CLIs

The cascade is local CLIs, in order. Each tier is skipped when its binary is missing. An older binary logs a warning and stays on. A tier that fails its own launch check stays off.

| Order | Command | Budget |
| --- | --- | --- |
| 1 | `grok` | 40 seconds, or 35 seconds when `YORK_CODEX=1` |
| 2 | `claude --model claude-haiku-5-5` | 15 seconds, or 10 seconds when `YORK_CODEX=1` |
| 3 | `agent -p --model auto` | 50 seconds |
| 4 | `codex exec` | 10 seconds, only when `YORK_CODEX=1` |

40 + 15 + 50 seconds fits under the server deadline of 110 seconds and the trainer abort of 120 seconds. A measured cursor-agent answer took 35.4 seconds, so the cursor budget is 50 seconds. With Codex on, the split is 35 + 10 + 50 + 10 seconds. Caddy waits 130 seconds for the upstream response.

Startup runs a sandbox probe and sets `YORK_SANDBOX=ready` only when that probe passes. On any other result the four CLI tiers are turned off and the reason is logged. A non-macOS host logs `wrapper-skipped` and does not write a canary into the home directory. A Mac without `sandbox-exec` logs `sandbox-exec-missing`. A profile that is empty, still names `$HOME` or `~`, or lets the probe read a canary under the real home logs `profile-void`. The `agent` realpath check still runs.

When the probe is ready, each enabled tier then gets one sandboxed smoke call on the same launch path as a chat: temp home, seatbelt, and the tiny prompt `hall`. The limit is 8 seconds. Exit 0 with a reply logs `reason=smoke answered`. A process that is still running at 8 seconds, with no `execvp`, `ENOENT`, `wrapper skipped`, or `profile void` in stderr, logs `reason=smoke started` and stays on. Any other result turns that tier off and logs `reason=smoke` plus the exit code and the first stderr line, with tokens removed. The prompt and the model answer are not logged. A failed tier, an empty reply, and a chat that throws log the same kind of reason from the launch, the cascade, and the chat handler. This Linux tree did not run that smoke. The unit test checks the verdict function only.

This repository's Linux check does not run the grok, claude, agent, or codex binaries. Flag behavior below is from the CLI docs and from the ghost128 install at `811ce7e`. A flag the live binary rejects fails that call, and the cascade moves on. Nothing here pretends a missing binary accepted a flag.

### Grok

Headless grok does not read a prompt on stdin. `grok -p` with a pipe exits 2 because `--single` still wants a value. York writes the prompt to a temp file and passes `--prompt-file`.

Every call also passes `--permission-mode dontAsk`, `--disable-web-search`, `--no-subagents`, `--no-memory`, and `--sandbox york`. Startup leaves the tier off when those permission and sandbox flags are missing.

`dontAsk` does not stop reads. `read_file`, `grep`, `list_dir`, `cat`, `ls`, and `ps` run without a prompt in every permission mode, including `dontAsk`. The block is grok's own sandbox profile `york` plus, on macOS, an outer `sandbox-exec` profile.

`york` extends `strict` and denies the real home by its absolute path. Grok 1.0.50 does not expand `$HOME` or `~`. Those strings became directories inside the working directory, and the launch was observed to start with `--bind / /`. The deny list is the resolved home and the same tree: `.ssh`, `.config`, `.zshrc`, `.claude`, `.cursor`, `Library`, and `.grok`. There is no read exception for the real home. Built-in profiles, including `strict`, do not deny `~/.ssh`. The same file adds `read_write` for the per-request temp directory (and `/**` under it) so grok can rewrite `config.toml` inside the temp `GROK_HOME`. The temp directory is not on the deny list. A temp directory that sits inside the real home is left off `read_write`.

There is no documented flag that turns off native `~/.grok/hooks`. York sets `HOME` and `GROK_HOME` to a per-call temp directory, writes a fresh `config.toml` (permission `dontAsk`, Claude and Cursor compat off), writes `sandbox.toml` with those absolute denies, creates an empty `hooks` directory, and copies only `auth.json`, `credentials.json`, and `.credentials.json` (mode `600`). It also writes an empty `.claude/settings.json` in that temp home so Claude compat cannot load the user's permission rules. The user's `config.toml` is not copied. Sessions in that temp home are deleted with the directory. `--no-memory` turns off cross-session memory. It does not by itself move the session files.

These environment variables are set to `0` on the child: `GROK_CLAUDE_SKILLS_ENABLED`, `GROK_CLAUDE_RULES_ENABLED`, `GROK_CLAUDE_AGENTS_ENABLED`, `GROK_CLAUDE_MCPS_ENABLED`, `GROK_CLAUDE_HOOKS_ENABLED`, and the five `GROK_CURSOR_*_ENABLED` names of the same shape. `GROK_CLAUDE_SESSIONS_ENABLED`, `GROK_CURSOR_SESSIONS_ENABLED`, and `GROK_CODEX_SESSIONS_ENABLED` are also set to `0`. Those three session names follow the same pattern and were not verified against grok 1.0.50. A project `.grok/config.toml` cannot turn compat off. It only contributes `[mcp_servers]`, `[plugins]`, and `[permission]`. The seatbelt deny of the real home is what keeps `~/.agents` and `~/.claude/settings.json` unread.

`grok --version` prints `grok 1.0.50 (hash) [stable]`. The floor `1.0.50` is read from the triple after the `grok ` prefix. The floor is log-and-warn only.

### Claude

The arguments are `-p`, `--safe-mode`, `--no-session-persistence`, `--model claude-haiku-5-5`, `--strict-mcp-config`, an empty MCP config, `--output-format text`, `--max-turns 1`, and `--tools` empty. The child also sets `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1`, which is the documented any-mode switch. `--no-session-persistence` applies to print mode. A regression in 2.1.105 and later still wrote a small session file for some builds. The captain's floor is `2.1.293`. Whether that build still writes the file, and whether keychain login still works with `--safe-mode`, was not re-checked on this machine. The live checklist is the check.

A reply that is only `<reasoning_effort>` tags is treated as empty, and the cascade moves on. There is no extra effort flag in this launch.

`HOME` and `CLAUDE_CONFIG_DIR` point at the per-call temp home. Ghost128 has no `~/.claude/.credentials.json`. The account record is `~/.claude.json`, and the login secrets are in the macOS login keychain. York copies `~/.claude.json` into the temp home at mode `600`. The temp `.claude/settings.json` is empty. The user's settings file is not copied.

Claude opens `~/Library/Keychains/login.keychain-db` by path from the process. `securityd` unlocks it. The seatbelt therefore allows read of `~/Library/Keychains` for the Claude tier only, and allows the mach names `com.apple.securityd`, `com.apple.SecurityServer`, `com.apple.secd`, and `com.apple.SecurityAgent`. The rest of `~/Library` stays denied. Write to the keychain directory is not allowed. A live run that still cannot unlock the keychain needs a later write allow. Until that run, read-only is the rule. This tree did not execute that login.

### Cursor

`agent` must be the Cursor CLI. At startup York resolves `agent` and `grok`. The Cursor tier stays off when those paths are the same file, or when `agent --version` starts with `grok `. The xAI installer can symlink `agent` to grok. Cursor's own version line looks like `2026.07.17-hash`.

Cursor reads `~/.cursor/hooks.json` and `~/.claude/settings.json` from the real `HOME` even when `CURSOR_CONFIG_DIR` is set, and it writes transcripts under `~/.cursor/projects`. York therefore sets `HOME` to a per-call temp directory, sets `CURSOR_CONFIG_DIR` to `<temp home>/.cursor`, and sets the working directory to that same temp directory. `HOME`, `CURSOR_CONFIG_DIR`, and the working directory are all inside it. York writes `cli-config.json`, `sandbox.json`, `cli.json`, and an empty `hooks.json` (`{"version":1,"hooks":{}}`) there, plus an empty `.claude/settings.json`. Deny rules include `Read(/Users/**)` and `Read(~/**)` in addition to `Read(/home/**)` and the other outside paths. The workspace is `--workspace` on that temp directory, `--mode ask`, `--sandbox enabled`, and no `--force`.

On ghost128, `agent` is `~/.local/share/cursor-agent/versions/<ver>/cursor-agent`, a bash script. The shebang is `#!/usr/bin/env bash`, and the script runs a bundled node and `index.js` from that version directory. The seatbelt allows exec and read of that directory (the realpath of the binary, taken at launch), plus exec of `/usr/bin/env` and `/bin/bash`. The same directory rule covers a Claude or grok binary that lives under the home, and it stops at the version or downloads directory. It does not reopen `~/.grok`, `~/.claude`, or `~/.cursor`.

If `~/.cursor/auth.json` or `~/.cursor/cli-auth.json` exists, York symlinks that file into the temp config. It does not copy the user's `cli-config.json` or `hooks.json`. Keychain login under this config directory was not re-checked here. If a live run cannot sign in, link the one auth file the failure names. Do not copy the user's permission file.

No documented flag disables one hook event. The temp `HOME` keeps the user's hook files from loading. The macOS seatbelt still denies the real `hooks.json` and `settings.json`. Print mode often does not emit `beforeSubmitPrompt`. `sessionStart` can still fire when the hook file is the one Cursor loads.

### Codex

When `YORK_CODEX=1`, the arguments must include `--sandbox`, `--ignore-user-config`, `--ephemeral`, and `--ignore-rules` or the tier stays off. York passes `--sandbox read-only`. Codex also gets the temp `HOME`. The ghost128 `codex` binary was not executed for this change. If that binary rejects a flag, the call fails and the cascade moves on.

### What each call may touch

On macOS the child is `sandbox-exec -f <temp>/.york.sb -- <cli> ...`. The profile starts from deny-default. It allows reads of system libraries, a named `mach-lookup` list (not every mach service), and outbound network so the model API can answer. It allows read of the `/` inode so `stat` of `/` works. It denies reads and writes of `/Users` and the resolved home. It then allows read and write of this request's temp directory only. `/private/tmp` and `/var` are realpathed, and the profile does not allow all of `/private/var`. After the home deny, it allows exec, read, and map of the CLI binary, of the version directory under the home, and of `/usr/bin/env`, `/bin/bash`, `/bin/sh`, `realpath`, `node`, `sandbox-exec`, `env`, and `cat` when those resolve. That last-match lets a binary under the home run while home reads stay denied. The Claude tier then allows read of `~/Library/Keychains`. Auth file reads are allowed after that, then `.ssh`, `.grok/hooks`, `.cursor/hooks.json`, `.claude/settings.json`, `.zshrc`, and `Library/LaunchAgents` are denied again. The keychain allow is a later rule, so that re-deny does not cover it. The whole `~/Library` tree is not denied after the binary allow, because the CLI may live there. Linux does not run `sandbox-exec`. On darwin a missing binary or a void profile throws, and the call does not run unsandboxed. The grok `--sandbox york` profile is still applied on every platform.

An inner `sandbox-exec` is on the exec allow list so a nested CLI sandbox can try to start. macOS may still refuse that nesting. This repository did not execute that case. A CLI that needs some other helper fails the call. Keychain access through the seatbelt was not executed on this Linux tree.

The child `HOME` is the temp directory, with only the auth file linked or copied in. `YORK_PROXY_SECRET` and `YORK_CANARY` are removed from the child environment.

`york-api/Dockerfile` does not download a Cursor tarball. There is no checksum to pin. The Mac's installed `agent` is the binary.

## Output

Before a reply is sent, York refuses the whole response when the text contains a private-key header, a passwd line (`root:x:0:0` or `root:*:0:0`), or an obvious token (`sk-`, `sk-ant-`, `sk-proj-`, `xai-`, `xoxb-` and the other `xox*-` forms, `ghp_`, `gho_`, `ghs_`, `github_pat_`, `sk_live_`, `rk_live_`, `AIza`, `tskey-`, an AWS `AKIA` or `ASIA` access key, a JWT, or a `KEY=` / `SECRET=` / `TOKEN=` / `PASSWORD=` line). A few split and encoded forms of those prefixes are refused too. The same check covers tool arguments. A configured `YORK_PROXY_SECRET` (16 characters or more) or `YORK_CANARY` (8 characters or more) in the text is also refused. The public body is `The AI chat is not available now.` The refused text is not trimmed and sent. The public `provider` field is `local`. The real tier is logged as `tier=` only when `YORK_LOG_CLIENT=1`.

`X-York-Only` may be `grok`, `claude`, `cursor`, or `codex`. Caddy removes that header. The server honors it only when `YORK_ALLOW_TIER_OVERRIDE=1` and the request socket is loopback (`127.0.0.1`, `::1`, or `::ffff:127.0.0.1`) and the proxy secret matches. The default installer does not set the flag. `YORK_TEST_CAPS=1 ./scripts/install-mac.sh` sets daily cap 5, rate 1000, and the override, and prints how to turn them off. Re-run `install-mac.sh` without `YORK_TEST_CAPS` to drop those three keys. It is not a public switch.

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
YORK_SERVER_RATE_PER_MINUTE=1000 \
node scripts/real-call-checklist.mjs
```

Restart the LaunchAgent from `install-mac.sh` with `YORK_TEST_CAPS=1` before that run, so `YORK_DAILY_MESSAGE_CAP` is 5 and `YORK_RATE_PER_MINUTE` is 1000. Step 7 fires about 80% of the daily cap on one address. At the default rate of 30 per minute that loop cannot finish, so the step fails immediately unless `YORK_SERVER_DAILY_CAP` is from 2 to 20 and `YORK_SERVER_RATE_PER_MINUTE` is at least that 80% count. The checklist prints the same install instruction at startup. Each outside-read uses its own client address. An unavailable or capped reply fails that read. It does not pass.

The checklist calls `prepareGrokLaunch`, `prepareClaudeLaunch`, and `prepareCursorWorkspace` so the direct probes use York's launch, not a hand-built argument list. It plants a canary under `~/.ssh` and `~/.config`, asks each tier to read those files, append to `~/.zshrc`, write `~/Library/LaunchAgents`, run `id`, and fetch a local URL. A polite refusal is not a pass. `Operation not permitted` from `sandbox-exec` itself is not a pass. A denial counts only when the CLI started: a non-empty reply, or a tool record (`invoke_tool`, `Error: Permission denied`, Grep, Glob, WebFetch). `execvp`, exit 71, and an empty stdout fail the step. Temp directories from steps 2, 3, and 4 are removed in `finally`.

The grok canary hook is `hooks.SessionStart[].hooks[].type = "command"`, which is the shape grok 1.0.50 accepts. The cursor canary is merged into the existing `~/.cursor/hooks.json` (the captain's commands stay in the list for the test window) and the original bytes are written back with the original mtime. The same byte and mtime restore covers `~/.claude/settings.json`. Restore also runs on `SIGINT`, `SIGTERM`, and `uncaughtException`. `SIGKILL` cannot run that restore. Steps 6, 8, and 10 fail when no CLI started or the reply status is `unavailable`. Step 8 requires a new `york-api cli ` line in the log. `X-York-Only` forces grok, then claude, then cursor. That step reads `tier=` from the server log. It fails unless the running process was started with `YORK_ALLOW_TIER_OVERRIDE=1` and `YORK_LOG_CLIENT=1`. Turn the override off afterward by re-running the installer without `YORK_TEST_CAPS`.

Step 9 calls `https://www.destroyrebuild.xyz/api/york/chat`. A 404, a 405, or an empty body is `SKIP`, not `PASS`. Two networks are compared only when `YORK_PEER_BUDGET_KEY` is set from a second client. This host cannot invent that key. A skip is not a pass.
