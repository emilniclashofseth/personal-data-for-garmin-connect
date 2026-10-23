# Personal Data for Garmin Connect (community)

**A personal, community-built plugin. It is not made, endorsed, or supported by Garmin.**
It reads **only your own data**, using a Garmin Connect Personal API key that you create for your own account.
It is read-only: it cannot change anything in Garmin Connect or on your devices.

Garmin and Garmin Connect are trademarks of Garmin Ltd. or its subsidiaries. They are used here only to say which
service the plugin works with.

It is a small stdio MCP server (Node.js 18+, **no dependencies, no install step**) packaged as a Cursor plugin, plus one
skill that tells the agent when to use the tools. It works with any MCP client that can launch a local stdio server
(Cursor, Grok Bot, Claude Desktop and others). The entry point is **`server/index.mjs`**.

## Tools
| Tool | What it returns | Garmin endpoint (GET) |
|---|---|---|
| `get_sleep` | nightly sleep: duration, stages, Sleep Score, sleep need, HR, respiration, SpO2, sleep stress | `/sleep-service/sleep/dailySleepSummariesByDate` (31-day chunks) |
| `get_hrv` | HRV last night, 7-day average, status, baseline | `/hrv-service/hrv/daily/{from}/{to}` (28-day chunks) |
| `get_daily_summaries` | steps, floors, HR, stress, Body Battery, intensity minutes, calories, respiration, SpO2 | `/usersummary-service/v2/dailysummaries` (31-day chunks) |
| `get_resting_heart_rate` | resting / min / max HR per day | same as above |
| `get_body_battery` | min, max, charged, drained, overnight gain, events | same as above |
| `get_stress` | average, max, qualifier, minutes per stress level | same as above |
| `list_activities` | activities in a date range (filter by type), up to 500 | `/activitylist-service/activities/search/activities` |
| `get_activity` | one activity in detail | `/activity-service/activity/{id}` |
| `download_activity_file` | saves the original file (a .zip with the .FIT) to your computer, returns the path. Pass `output_dir` (absolute) so it lands somewhere you keep; the default is a temp folder | `/download-service/files/activity/{id}` |
| `auth_status` | is the key configured (env or file), does Garmin accept it now, when the access token expires | token exchange only |

Each range tool takes `start_date` / `end_date` (`YYYY-MM-DD`, default the last 7 days), and up to 366 days per call.
The server splits long ranges into the sizes Garmin accepts. Most tools also take `raw: true` for Garmin's unmodified JSON,
with owner/profile fields removed.

## Install
There is nothing to install: the server uses only Node.js built-ins, so there is no `npm install` / `npm ci` step
(a `package-lock.json` with no packages is included so `npm ci` also succeeds). Get the code and run it with Node:

```bash
git clone https://github.com/emilniclashofseth/personal-data-for-garmin-connect.git
cd personal-data-for-garmin-connect
GARMIN_PERSONAL_API_KEY_FILE=$HOME/.config/garmin/connect-personal-api-key node server/index.mjs   # stdio MCP server
```

In Cursor you can instead install it from the directory:
https://cursor.directory/plugins/personal-data-for-garmin-connect-community

## Setup
1. **Create your key.** Sign in to Garmin Connect on the web and open
   **https://connect.garmin.com/app/settings/personalApiToken**. Select **Create Key**, read and accept Garmin's terms,
   choose an expiry (30 days, 90 days, 180 days or 1 year) and select **Create**. **Copy the key now.** Garmin shows it
   only once. Note the expiry date. Garmin's own instructions: https://developer.garmin.com/gc-developer-program/personal/personal-api/
2. **Give the key to the server** in one of two ways (never paste it into chat, a project file, or a commit):
   - **`GARMIN_PERSONAL_API_KEY_FILE`** (recommended outside Cursor): the absolute path of a file that contains only
     the key (one line; blank lines and lines starting with `#` are ignored). Create it with mode `600`, e.g.
     `install -m 600 /dev/null ~/.config/garmin/connect-personal-api-key` and paste the key into it with an editor.
     This keeps the key out of your MCP client's config file.
   - **`GARMIN_PERSONAL_API_KEY`**: the key itself, as an environment variable for the server. If both are set,
     `GARMIN_PERSONAL_API_KEY` wins.
3. **Register the server with your MCP client** and restart/reload it:
   - **Cursor:** install the plugin; Cursor asks for `GARMIN_PERSONAL_API_KEY` at install. To change it later, open
     **Plugins → Personal Data for Garmin Connect (community) → Configure** (for team installs this is in the Cursor
     dashboard), then reload the window.
   - **Any other client:** see [Use with other MCP clients](#use-with-other-mcp-clients-grok-bot-claude-desktop-etc).
4. Check it with the `auth_status` tool ("Is my Garmin key working?"), then ask something like "How did I sleep this
   week?" or "List my rides in September".

## Use with other MCP clients (Grok Bot, Claude Desktop, etc.)
The bundled `mcp.json` is for Cursor: `${CURSOR_PLUGIN_ROOT}` and `${GARMIN_PERSONAL_API_KEY}` are Cursor plugin
variables, and other clients will not expand them. Elsewhere, point the client at `server/index.mjs` with an
**absolute path** (no `~`, no `${...}`) and pass the key by file:

```json
{
  "mcpServers": {
    "garmin-personal-data": {
      "command": "node",
      "args": ["/absolute/path/to/personal-data-for-garmin-connect/server/index.mjs"],
      "env": { "GARMIN_PERSONAL_API_KEY_FILE": "/absolute/path/to/garmin-personal-api-key" }
    }
  }
}
```

- `command` may need the absolute path to `node` (`which node`) if the client does not inherit your shell's `PATH`.
- Put secrets in `env` (or better, in the key file), never in `args`: `args` show up in process lists.
- On Windows use a path like `"C:\\Users\\you\\personal-data-for-garmin-connect\\server\\index.mjs"`.

### Keeping the key out of client configs: launcher script
If your client can only run a command (or you want one place to manage the key), use a small launcher that reads the
key from a `600` file at start and `exec`s the server. The client config then names only the script, and the key never
appears in any config, argument list or log. A copy is in `examples/run-garmin.sh`:

```bash
#!/usr/bin/env bash
# Launcher for the Garmin community MCP server (stdio). Key comes from a 600 file; never from config or argv.
set -euo pipefail
ROOT=/absolute/path/to/personal-data-for-garmin-connect
export GARMIN_PERSONAL_API_KEY_FILE="${GARMIN_PERSONAL_API_KEY_FILE:-$HOME/.config/garmin/connect-personal-api-key}"
[ -r "$GARMIN_PERSONAL_API_KEY_FILE" ] || { echo "run-garmin: key file missing or unreadable" >&2; exit 1; }
exec node "$ROOT/server/index.mjs"
```

Client config: `{"command": "/absolute/path/to/run-garmin.sh", "args": []}`. Make the script executable
(`chmod 700`) and keep it, and the key file, outside any repository you commit.

## Expiry and renewal
- The key expires after the period you chose when you created it. Garmin emails you about a week before it expires.
  You can see its status and expiry date on the same settings page.
- The server swaps the key for an access token that lasts 24 hours (or until the key expires, if sooner). There is no
  refresh token, so it requests a new token on its own when needed. You don't need to do anything daily.
- **To renew:** create a new key at https://connect.garmin.com/app/settings/personalApiToken and put it where the
  server reads it: overwrite the key file named by `GARMIN_PERSONAL_API_KEY_FILE`, or replace `GARMIN_PERSONAL_API_KEY`
  in your client's settings (in Cursor: **Plugins → this plugin → Configure**). Then restart or reload the server. If the
  key expires or you delete it, tools return "key may have expired or been revoked" until you do this.
- `auth_status` tells you whether Garmin accepts the key right now and when the current 24 h access token expires.
  Garmin's Personal API does **not** report the key's own expiry date, so the tool doesn't guess it: check the settings
  page above, or note the date when you create the key.
- To revoke access at any time, delete the key on that page. The key and every token made from it stop working.

## Privacy and security
- Your key is stored either by your MCP client (e.g. Cursor's plugin settings) and passed to the local server as an
  environment variable, or in a file you control (`GARMIN_PERSONAL_API_KEY_FILE`) that the server reads at runtime. It
  is sent only to Garmin (`personal.connectapi.garmin.com`), to get the access token.
- The access token stays in memory. Nothing is written to disk except files you ask `download_activity_file` to save.
- Errors are redacted. The key and the token are never logged or returned.
- No telemetry, no third-party servers. Your data goes from Garmin to your machine and to the AI model you use in your
  client. Check that you are comfortable sharing health data with that model.
- Garmin's Personal API is for **personal use of your own data**. Do not use this plugin to run a service for other
  people, and do not share your key.

## Troubleshooting
- **"No Garmin Personal API key is configured"** although you set one: your client probably passed the literal text
  `${GARMIN_PERSONAL_API_KEY}` (only Cursor expands it). Use an absolute `GARMIN_PERSONAL_API_KEY_FILE` instead.
- **"could not be read (ENOENT/EACCES)"**: the key file path is wrong or not readable by the user the client runs as.
- **"key may have expired or been revoked"**: renew (see above). `auth_status` confirms when it works again.
- **Server doesn't start in a non-Cursor client**: use absolute paths for both `node` and `server/index.mjs`.

## Limits and caveats
- Garmin does not publish rate limits for the Personal API. The server waits briefly between calls and retries up to 3
  times on HTTP 429/5xx, honouring `Retry-After`. If you still hit a limit, use a shorter range or wait a few minutes.
- Not in the Personal API: Training Readiness, Training Status, Sleep Coach, and any write (gear, activity type, uploads).
- Field names come from Garmin's Personal API (see Garmin's Swagger docs and its official Python client,
  https://github.com/garmin/connect-personal-api-python) and may change when Garmin updates it.
- When you publish charts or summaries made from this data, credit Garmin as the source, as Garmin's API brand
  guidelines ask (https://developer.garmin.com/brand-guidelines/api-brand-guidelines/).

## Development
```bash
npm test                                            # offline tests: node --test test/*.test.mjs (mocked Garmin; no key)
GARMIN_PERSONAL_API_KEY_FILE=/path/to/key npm run test:live   # a few real read-only calls against your own account
```
No dependencies, no install step (`npm ci` works with the empty lockfile but isn't needed). The code: `server/client.mjs` (token exchange, retries, date chunking), `server/tools.mjs` (tools and
output shapes), `server/index.mjs` (MCP stdio JSON-RPC).

## License
MIT. See `LICENSE`. Not affiliated with Garmin.
