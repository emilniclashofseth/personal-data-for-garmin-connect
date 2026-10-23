# Local proof, 23 Oct 2026 (Europe/Oslo)

Real key from the owner's account, read-only calls only, output to /tmp (nothing written into any project data).

| Check | Result |
|---|---|
| `node --check` on all three server files | PASS |
| `npm test` (offline, mocked Garmin): chunking, date validation, missing/unexpanded key → setup help with no request, token reuse + JWT exp, 429 retry with Retry-After, 401 re-exchange, redaction of key/token in errors, 93-day sleep → 3 calls, MCP initialize/tools/list/annotations | 8/8 PASS (live test skipped by default) |
| `npm run test:live` (real key) | PASS: 7 days, 6 nights, 3 activities. 3 requests, 1 token exchange, 0 throttled |
| stdio JSON-RPC session (spawned server) | initialize (2025-06-18), tools/list = 9 tools |
| `get_daily_summaries` 17–23 Oct | 7 days |
| `get_sleep` 17–23 Oct | 6 nights (one night has no Garmin data), last = 23 Oct, scored |
| `get_hrv` 1 Sep–23 Oct (2 chunks of 28 days) | 52 days |
| `get_body_battery` 22 Oct | overnight gain present, 2 events |
| `list_activities` 15–23 Oct, limit 5 | 5. No owner/profile fields in the output |
| `get_activity` | id matches, 23 non-null fields |
| `download_activity_file` | 18,577-byte .zip containing `<id>_ACTIVITY.fit` (61,219 bytes, `.FIT` header) |
| 732-day range | rejected client-side with a clear message (no call) |
| Whole live session | 3.1 s. No 429s. Output scanned: key 0 hits, JWT 0 hits |
| Manifests | Cursor `plugin-template` validator: PASS (warning only: no hooks). `mcp.json` server entry validates against agent-plugins.org mcp.schema 1.0.0. `variables` uses only allowed keywords, every `${VAR}` declared |
| Local install | real directory `~/.cursor/plugins/local/personal-data-for-garmin-connect` (not a symlink) |
| Cursor launch simulation | read `mcp.json` from the installed copy, expanded `${CURSOR_PLUGIN_ROOT}` and `${GARMIN_PERSONAL_API_KEY}` in memory, spawned → 9 tools, `get_resting_heart_rate` 3 days OK |

Not provable here: the `@anysphere/cursor-plugins` loader (`loadUserLocalPlugins`) is not on the public npm registry
(404), and there is no Cursor IDE on this machine. So these are unverified: the Customize UI, the variables prompt at
install, and org policy ("Allow Local Plugin Imports").
