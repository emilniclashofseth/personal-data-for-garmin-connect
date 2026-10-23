#!/usr/bin/env bash
# Launcher for the Garmin community MCP server (stdio).
# The key comes from a mode-600 file at launch, so it is never placed in an MCP client config, argv, or a log.
# Point your MCP client at this script: {"command": "/absolute/path/to/run-garmin.sh", "args": []}
set -euo pipefail
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"   # repo root; or set an absolute path here
export GARMIN_PERSONAL_API_KEY_FILE="${GARMIN_PERSONAL_API_KEY_FILE:-$HOME/.config/garmin/connect-personal-api-key}"
[ -r "$GARMIN_PERSONAL_API_KEY_FILE" ] || { echo "run-garmin: key file missing or unreadable: $GARMIN_PERSONAL_API_KEY_FILE" >&2; exit 1; }
cd "$ROOT"
exec node "$ROOT/server/index.mjs"
