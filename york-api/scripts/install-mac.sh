#!/bin/bash
# Install york-api as a per-user LaunchAgent on the captain's Mac.
# The process listens on 127.0.0.1. Tailscale Funnel publishes that port.
# No LLM API key is required. The CLIs already signed in on this Mac are the models.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "install-mac.sh runs on the captain's Mac (ghost128)." >&2
  exit 1
fi

if [[ -z "${YORK_PROXY_SECRET:-}" || ${#YORK_PROXY_SECRET} -lt 16 ]]; then
  echo "Export YORK_PROXY_SECRET with at least 16 characters, then run this again." >&2
  echo "Set that same value on the Railway static site." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
PORT="${PORT:-8787}"
PLIST="$HOME/Library/LaunchAgents/xyz.destroyrebuild.york-api.plist"
UID_NUM="$(id -u)"
PATH_VALUE="${PATH}:/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin"

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  printf '%s' "$value"
}

cd "$ROOT"
npm ci

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

umask 077
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>xyz.destroyrebuild.york-api</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$(xml_escape "$ROOT")</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml_escape "$NODE_BIN")</string>
    <string>--experimental-strip-types</string>
    <string>src/server.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>YORK_BIND_HOST</key>
    <string>127.0.0.1</string>
    <key>PORT</key>
    <string>$(xml_escape "$PORT")</string>
    <key>YORK_PROXY_SECRET</key>
    <string>$(xml_escape "$YORK_PROXY_SECRET")</string>
    <key>HOME</key>
    <string>$(xml_escape "$HOME")</string>
    <key>USER</key>
    <string>$(xml_escape "${USER:-ghost128}")</string>
    <key>PATH</key>
    <string>$(xml_escape "$PATH_VALUE")</string>
    <key>YORK_LOG_CLIENT</key>
    <string>1</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$(xml_escape "$HOME/Library/Logs/york-api.log")</string>
  <key>StandardErrorPath</key>
  <string>$(xml_escape "$HOME/Library/Logs/york-api.log")</string>
</dict>
</plist>
EOF
chmod 600 "$PLIST"

launchctl bootout "gui/${UID_NUM}" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/${UID_NUM}" "$PLIST"
launchctl enable "gui/${UID_NUM}/xyz.destroyrebuild.york-api"

echo "york-api is loaded for gui/${UID_NUM} and listens on 127.0.0.1:${PORT}."
echo "Publish it with: tailscale funnel --bg ${PORT}"
echo "On the Railway static site set YORK_API_UPSTREAM to that funnel origin and YORK_PROXY_SECRET to the same secret."
