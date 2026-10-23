# Personal Data for Garmin Connect (community)

**A personal, community-built plugin. It is not made, endorsed, or supported by Garmin.**
It reads **only your own data**, using a Garmin Connect Personal API key that you create for your own account.
It is read-only: it cannot change anything in Garmin Connect or on your devices.

Garmin and Garmin Connect are trademarks of Garmin Ltd. or its subsidiaries. They are used here only to say which
service the plugin works with.

It is a Cursor plugin with a small stdio MCP server (Node.js 18+, no dependencies) and one skill that tells the agent
when to use the tools.

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
| `download_activity_file` | saves the original file (a .zip with the .FIT) to your computer, returns the path | `/download-service/files/activity/{id}` |

Each range tool takes `start_date` / `end_date` (`YYYY-MM-DD`, default the last 7 days), and up to 366 days per call.
The server splits long ranges into the sizes Garmin accepts. Most tools also take `raw: true` for Garmin's unmodified JSON,
with owner/profile fields removed.

## Setup
1. **Create your key.** Sign in to Garmin Connect on the web and open
   **https://connect.garmin.com/app/settings/personalApiToken**. Select **Create Key**, read and accept Garmin's terms,
   choose an expiry (30 days, 90 days, 180 days or 1 year) and select **Create**. **Copy the key now.** Garmin shows it
   only once. Garmin's own instructions: https://developer.garmin.com/gc-developer-program/personal/personal-api/
2. **Install the plugin** in Cursor.
3. **Paste the key** into the plugin's setting **`GARMIN_PERSONAL_API_KEY`** (the only setting). Cursor asks for it
   when you install the plugin. To change it later, open **Plugins → Personal Data for Garmin Connect (community) →
   Configure** (for team installs this is in the Cursor dashboard), then reload the window. Never paste the key into
   chat, a project file, or a commit.
4. Ask something like "How did I sleep this week?" or "List my rides in September".

Running the server outside Cursor (any MCP client): `GARMIN_PERSONAL_API_KEY=<your key> node server/index.mjs`. In a
client config, set the key in the server's `env`, not in its `args`.

## Expiry and renewal
- The key expires after the period you chose when you created it. Garmin emails you about a week before it expires.
  You can see its status and expiry date on the same settings page.
- The server swaps the key for an access token that lasts 24 hours (or until the key expires, if sooner). There is no
  refresh token, so it requests a new token on its own when needed. You don't need to do anything daily.
- **To renew:** create a new key at https://connect.garmin.com/app/settings/personalApiToken, paste it into
  `GARMIN_PERSONAL_API_KEY` under **Plugins → this plugin → Configure** (replacing the old one) and reload. If the key expires or you delete it, tools return
  "key may have expired or been revoked" until you do this.
- To revoke access at any time, delete the key on that page. The key and every token made from it stop working.

## Privacy and security
- Your key is stored by your MCP client (Cursor's plugin settings) and passed to the local server as an environment
  variable. It is sent only to Garmin (`personal.connectapi.garmin.com`), to get the access token.
- The access token stays in memory. Nothing is written to disk except files you ask `download_activity_file` to save.
- Errors are redacted. The key and the token are never logged or returned.
- No telemetry, no third-party servers. Your data goes from Garmin to your machine and to the AI model you use in your
  client. Check that you are comfortable sharing health data with that model.
- Garmin's Personal API is for **personal use of your own data**. Do not use this plugin to run a service for other
  people, and do not share your key.

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
npm test                                            # offline tests (mocked Garmin; no key needed)
GARMIN_PERSONAL_API_KEY=... npm run test:live       # a few real read-only calls against your own account
```
No dependencies. The code: `server/client.mjs` (token exchange, retries, date chunking), `server/tools.mjs` (tools and
output shapes), `server/index.mjs` (MCP stdio JSON-RPC).

## License
MIT. See `LICENSE`. Not affiliated with Garmin.
