---
name: garmin-personal-data
description: Use when the user asks about their own Garmin data, such as sleep, HRV, resting heart rate, Body Battery, stress, steps or daily summaries, or about Garmin activities (runs, rides, swims, strength), training load, or wants an activity's original .FIT file. Calls the read-only tools of the garmin-personal-data MCP server (unofficial community plugin, not affiliated with Garmin).
---

# Your Garmin Connect data (community plugin)

Data shapes the tools return (all carry `data_source: "Garmin"`):
- `NightSleep = { date (wake day), start_local, end_local, duration_min, deep/light/rem/awake_min, score, sleep_need_min, avg_hr, avg_respiration, avg_spo2 }`
- `DayHealth = { date, steps, resting_hr, stress{avg,max}, body_battery{min,max,charged,drained,sleep_gain}, intensity_min, calories }`
- `Activity = { activity_id, name, type, start_local, duration_min, distance_km, avg_hr, calories, training_load, aerobic_te }`

## Which tool
| Question | Tool |
|---|---|
| How did I sleep / sleep trend | `get_sleep` |
| HRV, HRV status | `get_hrv` |
| Resting heart rate trend | `get_resting_heart_rate` |
| Body Battery, energy, overnight recharge | `get_body_battery` |
| Stress | `get_stress` |
| Steps, calories, intensity minutes, "how was my day" | `get_daily_summaries` |
| What did I do / workouts in a period | `list_activities` |
| One workout in detail | `get_activity` (id from `list_activities`) |
| The original file for analysis tools | `download_activity_file` (pass an absolute `output_dir` the user keeps; default is a temp folder) |
| Is my key working / when does it expire? | `auth_status` |

## Rules
- Dates are `YYYY-MM-DD`. A night of sleep is labelled by the morning it ends. Times are the user's local wall time.
- Fetch the smallest range that answers the question (default is the last 7 days; activities 30). Ranges up to a year are split automatically, but they take longer.
- General wellness information only, not medical advice. Report what Garmin recorded; don't diagnose, name conditions, or suggest treatment or medication. When you interpret health values or trends (HRV, resting HR, SpO2, respiration, stress, sleep), add a short note that this is not medical advice. If values look concerning or the user mentions symptoms, suggest they talk to a doctor or other qualified health professional (for an emergency, local emergency services).
- Never invent or estimate values. A `null` means Garmin has no value for that day.
- When you show Garmin data in a chart, table or summary, say it comes from Garmin (e.g. "Source: Garmin").
- Not available from this API: Training Readiness, Training Status, Sleep Coach, workouts/courses upload, editing activities. Say so instead of guessing.
- If a tool says the key is missing, expired or rejected, tell the user to create a key at https://connect.garmin.com/app/settings/personalApiToken and give it to this server the way their MCP client does it: the `GARMIN_PERSONAL_API_KEY` setting or env var (in Cursor: Plugins → this plugin → Configure), or a key file named by `GARMIN_PERSONAL_API_KEY_FILE`; then restart or reload the server. Confirm with `auth_status`. Never ask the user to paste the key into chat.
- `auth_status` cannot see the key's own expiry date (Garmin's API doesn't expose it). Don't guess one: point to the settings page above, or use the date the user noted when they created the key.
