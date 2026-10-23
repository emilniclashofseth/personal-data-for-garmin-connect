# Garmin terms and trademark notes (checked 23 Oct 2026)

Not legal advice. Sources are linked. Where something can't be verified, it says so.

1. **Personal API terms.** Garmin shows the Personal API Terms and Conditions only when you create a key. No public
   copy was found. Public statements (Personal API FAQ, https://developer.garmin.com/gc-developer-program/personal/personal-faq/):
   it is "for individual Garmin users who want programmatic access to their own data" and "not intended for commercial
   applications serving multiple end users". It is for "developers, hobbyists, data enthusiasts … personal applications".
   → The plugin fits: each user creates their own key and runs the server locally on their own data. Nothing is hosted
   and no keys are collected. Do not offer a hosted version or collect other people's keys. **Open:** the accepted T&Cs
   may say something about distributing client software, and only a key holder can read them.
2. **Garmin publishes its own client** (Apache-2.0): https://github.com/garmin/connect-personal-api-python. Garmin
   says developers should use it and its Swagger docs. This plugin copies no code from it.
3. **Garmin.com Terms of Use §3.5 Trademarks** (https://www.garmin.com/en-US/legal/terms-of-use/): "You are prohibited
   from use of the Marks without the express, written authorization of Garmin … email terms@garmin.com." This is
   strict. A plain descriptive mention of the service the plugin works with ("for Garmin Connect") is normally
   allowed as nominative use. A name that suggests Garmin made the plugin, or any logo use, is not. Safest: ask
   terms@garmin.com before listing, or use a name without "Garmin" in the identifier.
4. **Garmin API Brand Guidelines** (v 6.30.2025, https://developer.garmin.com/downloads/brand/Garmin-Developer-API-Brand-Guidelines.pdf).
   They formally bind developer-program licensees and are a sensible bar to meet here:
   - Show Garmin as the data source ("Garmin [device model]", or "Garmin" when the model is unknown) on data views,
     exports, derived or AI output. This plugin returns `data_source: "Garmin"` and the skill tells the agent to credit it.
   - Do not alter the Garmin tag logo or use it in avatars, badges or unrelated imagery. This plugin uses no Garmin logo;
     its icon is a neutral heart-rate line.
   - Do not imply Garmin endorsement. When naming the app, use "Garmin Connect" in full, not abbreviated or stylised.
   - "Noncompliance may result in suspension or termination of API access."
5. **Connect IQ** (context only, does not apply directly): Garmin's store team was told to treat any use of Garmin
   trademarks (including product names) as infringement unless Garmin gave permission
   (https://forums.garmin.com/developer/connect-iq/f/discussion/413172). This shows how strict Garmin is.
6. **Prior art:** a third-party TypeScript server, "garmin-personal-mcp", is described at
   https://shapecalendar.com/guides/garmin-personal-api. Pick a name that can't be confused with it.
7. **Data limits** (Garmin's embedded OpenAPI): sleep summaries ≤31 days, stress and steps ≤28 days, Body Battery ≤31
   days, dailysummaries v2 up to 1 year. This plugin chunks sleep at 31 days, HRV at 28 and daily summaries at 31. All
   three sizes were tested live.

## Naming decision
- Identifier `personal-data-for-garmin-connect`, display name **"Personal Data for Garmin Connect (community)"**. The
  name leads with what the plugin is and uses "for" to say what it works with.
- Fallback if Garmin objects or Emil wants zero trademark risk: `personal-fitness-data-gc` / "Personal fitness data
  (community, for Garmin Connect users)".
- Every surface carries the disclaimer "not made or endorsed by Garmin" and a trademark notice.
