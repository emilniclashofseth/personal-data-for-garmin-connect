# cursor.directory listing: PUBLISHED

**Live listing:** https://cursor.directory/plugins/personal-data-for-garmin-connect-community

The text below is the listing copy as submitted (kept here for future edits). The directory builds the install config
from this repo's `mcp.json`. Changes to this file do not update the live listing; resubmit after the owner approves.

**Name:** Personal Data for Garmin Connect (community)

**Short description (≤160 chars):**
Community plugin, not made or endorsed by Garmin. Read-only access to your own Garmin Connect data (sleep, HRV, Body Battery, activities) via your API key.

**Long description:**
Ask your agent about your own Garmin Connect data: sleep and Sleep Score, HRV and HRV status, resting heart rate,
Body Battery, stress, steps and daily summaries, and your activities with training load and training effect. You can
also save an activity's original .FIT file to your computer.

This is a personal, community-built plugin. **It is not made, endorsed or supported by Garmin.** It uses Garmin's
official Personal API with a key you create for your own account, so it reads **only your own data**, and it is
read-only. It runs as a small local MCP server (Node.js 18+, no dependencies). No hosted service, no telemetry. Your
key goes only to Garmin, and access tokens stay in memory.

Setup: create a key at https://connect.garmin.com/app/settings/personalApiToken (Garmin's instructions:
https://developer.garmin.com/gc-developer-program/personal/personal-api/) and paste it into the plugin's
`GARMIN_PERSONAL_API_KEY` setting (other MCP clients: `GARMIN_PERSONAL_API_KEY_FILE`, see the README). The key expires after the period you choose (30 days to 1 year). Garmin emails you
a week before it expires: create a new key and paste it in again.

Tools: get_sleep, get_hrv, get_daily_summaries, get_resting_heart_rate, get_body_battery, get_stress,
list_activities, get_activity, download_activity_file, auth_status (added in 0.2.0, not yet in the live listing text).

Not included (the Personal API doesn't offer them): Training Readiness, Training Status, Sleep Coach, uploads or edits.

Garmin and Garmin Connect are trademarks of Garmin Ltd. or its subsidiaries.

**Keywords:** garmin-connect, personal-api, health, sleep, hrv, body-battery, fitness, activities, fit, mcp
