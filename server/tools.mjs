// Tool definitions and compact, stable output shapes.
//   NightSleep   = { date, start_local, end_local, duration_min, deep_min, light_min, rem_min, awake_min, score, ... }
//   DayHealth    = { date, steps, resting_hr, stress, body_battery, intensity_min, calories, ... }
//   Activity     = { activity_id, name, type, start_local, duration_min, distance_km, avg_hr, training_load, ... }
// Every result carries `data_source: "Garmin"` (Garmin's API brand guidelines ask for source attribution).
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GarminError, chunks, resolveRange } from "./client.mjs";

const LIMITS = { sleep: 31, hrv: 28, daily: 31 };   // days per Garmin call (sleep: documented 31; HRV/daily: proven safe sizes)
const SOURCE = "Garmin";

const r1 = (x, d = 1) => (typeof x === "number" ? Math.round(x * 10 ** d) / 10 ** d : null);
const mins = (s) => (typeof s === "number" ? Math.floor(s / 60) : null);
const msMin = (ms) => (typeof ms === "number" ? Math.round(ms / 60000) : null);
const localTs = (ms) => (typeof ms === "number" ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : null); // Garmin encodes local wall time as UTC ms
const val = (x) => (x && typeof x === "object" ? x.value ?? null : x ?? null);

// ---------- transforms
export function nightSleep(s) {
  const sc = s.sleepScores?.overall;
  return {
    date: s.calendarDate,
    start_local: localTs(s.sleepStartTimestampLocal), end_local: localTs(s.sleepEndTimestampLocal),
    duration_min: mins(s.sleepTimeSeconds),
    deep_min: mins(s.deepSleepSeconds), light_min: mins(s.lightSleepSeconds), rem_min: mins(s.remSleepSeconds), awake_min: mins(s.awakeSleepSeconds),
    nap_min: mins(s.napTimeSeconds),
    score: sc?.value ?? null, score_qualifier: sc?.qualifierKey ?? null,
    sleep_need_min: s.sleepNeed?.actual ?? null,
    avg_hr: r1(s.avgHeartRate), avg_respiration: r1(s.averageRespirationValue), avg_spo2: r1(s.averageSpO2Value),
    lowest_spo2: s.lowestSpO2Value ?? null, avg_sleep_stress: r1(s.avgSleepStress), awake_count: s.awakeCount ?? null,
    manually_confirmed: s.sleepWindowConfirmationType ? !/AUTO/i.test(s.sleepWindowConfirmationType) : null,
  };
}

export function hrvDay(h) {
  return {
    date: h.calendarDate, last_night_avg_ms: h.lastNightAvg ?? null, weekly_avg_ms: h.weeklyAvg ?? null,
    last_night_5min_high_ms: h.lastNight5MinHigh ?? null, status: h.status ?? null,
    baseline: h.baseline ? { low_upper: h.baseline.lowUpper ?? null, balanced_low: h.baseline.balancedLow ?? null, balanced_upper: h.baseline.balancedUpper ?? null } : null,
  };
}

function bbSleepGain(bb) {
  const ev = (bb?.activityEvents || []).filter((e) => e.eventType === "SLEEP");
  return ev.length ? ev.reduce((a, e) => a + (e.bodyBatteryImpact || 0), 0) : null;
}

export function dayHealth(d) {
  const hr = d.heartRate || {}, st = d.stress || {}, bb = d.bodyBattery || {}, mv = d.movement || {};
  return {
    date: d.calendarDate,
    steps: val(mv.steps), floors_up: val(mv.floorsAscended),
    resting_hr: hr.restingValue ?? null, min_hr: hr.minValue ?? null, max_hr: hr.maxValue ?? null,
    stress: { avg: st.avgLevel ?? null, max: st.maxLevel ?? null, qualifier: st.qualifier ?? null },
    body_battery: { min: bb.minValue ?? null, max: bb.maxValue ?? null, charged: bb.chargedValue ?? null, drained: bb.drainedValue ?? null, latest: bb.latestValue ?? null, sleep_gain: bbSleepGain(bb) },
    intensity_min: { moderate: d.intensityMinutes?.moderate ?? null, vigorous: d.intensityMinutes?.vigorous ?? null },
    calories: { total: d.calories?.burnedTotal ?? null, active: d.calories?.burnedActive ?? null, resting: d.calories?.burnedResting ?? null },
    respiration_avg: d.respiration?.avgValue ?? null, spo2_avg: d.pulseOx?.avgValue ?? null,
  };
}

export function restingHrDay(d) { const hr = d.heartRate || {}; return { date: d.calendarDate, resting_hr: hr.restingValue ?? null, min_hr: hr.minValue ?? null, max_hr: hr.maxValue ?? null }; }

export function bodyBatteryDay(d) {
  const bb = d.bodyBattery || {};
  return {
    date: d.calendarDate, min: bb.minValue ?? null, max: bb.maxValue ?? null, charged: bb.chargedValue ?? null, drained: bb.drainedValue ?? null,
    latest: bb.latestValue ?? null, sleep_gain: bbSleepGain(bb),
    events: (bb.activityEvents || []).map((e) => ({ type: e.eventType, start_local: e.eventStartTimeLocal?.slice(0, 16).replace("T", " ") ?? null, duration_min: msMin(e.durationInMilliseconds), impact: e.bodyBatteryImpact ?? null })),
  };
}

export function stressDay(d) {
  const s = d.stress || {};
  return {
    date: d.calendarDate, avg: s.avgLevel ?? null, max: s.maxLevel ?? null, qualifier: s.qualifier ?? null,
    minutes: { rest: msMin(s.restDurationInMillis), low: msMin(s.lowStressDurationInMillis), medium: msMin(s.mediumStressDurationInMillis), high: msMin(s.highStressDurationInMillis), activity: msMin(s.activityDurationInMillis), uncategorized: msMin(s.uncategorizedDurationInMillis) },
  };
}

export function activity(a) {
  return {
    activity_id: a.activityId, name: a.activityName ?? null,
    type: a.activityType?.typeKey ?? null, start_local: a.startTimeLocal?.slice(0, 16) ?? null, start_gmt: a.startTimeGMT?.slice(0, 16) ?? null,
    duration_min: r1(a.duration / 60), moving_min: r1(a.movingDuration / 60), elapsed_min: r1(a.elapsedDuration / 60),
    distance_km: typeof a.distance === "number" ? r1(a.distance / 1000, 2) : null,
    avg_hr: r1(a.averageHR, 0), max_hr: r1(a.maxHR, 0), calories: r1(a.calories, 0),
    training_load: r1(a.activityTrainingLoad), aerobic_te: r1(a.aerobicTrainingEffect), anaerobic_te: r1(a.anaerobicTrainingEffect),
    elevation_gain_m: r1(a.elevationGain, 0), avg_speed_kmh: typeof a.averageSpeed === "number" ? r1(a.averageSpeed * 3.6) : null,
    steps: a.steps ?? null, manual: a.manualActivity ?? a.isManualActivity ?? null,
  };
}

export function activityDetail(d) {
  const s = d.summaryDTO || {}, m = d.metadataDTO || {};
  return {
    activity_id: d.activityId, name: d.activityName ?? null, type: d.activityTypeDTO?.typeKey ?? null,
    start_local: s.startTimeLocal?.slice(0, 16).replace("T", " ") ?? null,
    duration_min: r1(s.duration / 60), moving_min: r1(s.movingDuration / 60), elapsed_min: r1(s.elapsedDuration / 60),
    distance_km: typeof s.distance === "number" ? r1(s.distance / 1000, 2) : null,
    avg_hr: r1(s.averageHR, 0), max_hr: r1(s.maxHR, 0), min_hr: r1(s.minHR, 0),
    avg_speed_kmh: typeof s.averageSpeed === "number" ? r1(s.averageSpeed * 3.6) : null,
    max_speed_kmh: typeof s.maxSpeed === "number" ? r1(s.maxSpeed * 3.6) : null,
    elevation_gain_m: r1(s.elevationGain, 0), elevation_loss_m: r1(s.elevationLoss, 0),
    calories: r1(s.calories, 0), training_load: r1(s.activityTrainingLoad), aerobic_te: r1(s.trainingEffect), anaerobic_te: r1(s.anaerobicTrainingEffect),
    training_effect_label: s.trainingEffectLabel ?? null, body_battery_change: s.differenceBodyBattery ?? null,
    avg_power_w: r1(s.averagePower, 0), normalized_power_w: r1(s.normalizedPower, 0), avg_cadence: r1(s.averageRunCadence ?? s.averageBikeCadence, 0),
    steps: s.steps ?? null, lap_count: m.lapCount ?? null, manual: m.manualActivity ?? null, file_format: m.fileFormat?.formatKey ?? null,
    manufacturer: m.manufacturer ?? null,
  };
}

const PRIVATE = /^owner|^userProfile|ProfileImage|^userInfoDto$/;
function scrub(o) {   // drop account/profile identifiers from raw payloads
  if (Array.isArray(o)) return o.map(scrub);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).filter(([k]) => !PRIVATE.test(k)).map(([k, v]) => [k, scrub(v)]));
  return o;
}

// ---------- fetchers
async function sleepRange(c, start, end) {
  const out = [];
  for (const [s, e] of chunks(start, end, LIMITS.sleep)) {
    const r = await c.get("/sleep-service/sleep/dailySleepSummariesByDate", { startDate: s, endDate: e });
    out.push(...(Array.isArray(r) ? r : r?.dailySleepSummaries || []));
  }
  return out.filter((x) => x.calendarDate >= start && x.calendarDate <= end);
}
async function hrvRange(c, start, end) {
  const out = [];
  for (const [s, e] of chunks(start, end, LIMITS.hrv)) out.push(...((await c.get(`/hrv-service/hrv/daily/${s}/${e}`))?.hrvSummaries || []));
  return out;
}
async function dailyRange(c, start, end) {
  const out = [];
  for (const [s, e] of chunks(start, end, LIMITS.daily)) {
    const r = await c.get("/usersummary-service/v2/dailysummaries", { startDate: s, endDate: e });
    out.push(...(Array.isArray(r) ? r : r?.data || []));
  }
  return out;
}
async function activityList(c, { start, end }, { type, limit }) {
  const out = [];
  for (let offset = 0; out.length < limit; offset += 100) {
    const page = await c.get("/activitylist-service/activities/search/activities",
      { start: offset, limit: Math.min(100, limit - out.length), startDate: start, endDate: end, activityType: type });
    if (!Array.isArray(page) || !page.length) break;
    out.push(...page);
    if (page.length < Math.min(100, limit - out.length + page.length)) break;
  }
  return out.slice(0, limit);
}

// ---------- tool table
const range = {
  start_date: { type: "string", description: "First calendar day, YYYY-MM-DD. Default: 7 days before end_date." },
  end_date: { type: "string", description: "Last calendar day (inclusive), YYYY-MM-DD. Default: today (local)." },
};
const rawFlag = { raw: { type: "boolean", description: "Return Garmin's unmodified JSON instead of the compact shape (larger).", default: false } };
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function wrap(rows, extra = {}) { return { data_source: SOURCE, ...extra, count: rows.length, items: rows }; }

export const TOOLS = [
  {
    name: "get_sleep", title: "Sleep (nightly)",
    description: "Nightly sleep for a date range: duration, stages, Sleep Score, sleep need, HR, respiration, SpO2, sleep stress. A night is labelled by the morning it ends. Up to 366 days per call (fetched in 31-day chunks).",
    inputSchema: { type: "object", properties: { ...range, ...rawFlag }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); const rows = await sleepRange(c, r.start, r.end); return wrap(a.raw ? scrub(rows) : rows.map(nightSleep), { range: r }); },
  },
  {
    name: "get_hrv", title: "HRV (nightly + 7-day)",
    description: "Heart-rate variability per day: last-night average, 7-day average, 5-min high, HRV status and baseline band (ms). Up to 366 days per call (28-day chunks).",
    inputSchema: { type: "object", properties: { ...range, ...rawFlag }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); const rows = await hrvRange(c, r.start, r.end); return wrap(a.raw ? scrub(rows) : rows.map(hrvDay), { range: r }); },
  },
  {
    name: "get_daily_summaries", title: "Daily summaries",
    description: "One row per day: steps, floors, resting/min/max HR, stress, Body Battery (incl. overnight gain), intensity minutes, calories, respiration, SpO2. Up to 366 days per call (31-day chunks).",
    inputSchema: { type: "object", properties: { ...range, ...rawFlag }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); const rows = await dailyRange(c, r.start, r.end); return wrap(a.raw ? scrub(rows) : rows.map(dayHealth), { range: r }); },
  },
  {
    name: "get_resting_heart_rate", title: "Resting heart rate",
    description: "Resting, minimum and maximum heart rate per day (bpm). Up to 366 days per call.",
    inputSchema: { type: "object", properties: { ...range }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); return wrap((await dailyRange(c, r.start, r.end)).map(restingHrDay), { range: r }); },
  },
  {
    name: "get_body_battery", title: "Body Battery",
    description: "Body Battery per day: min, max, charged, drained, latest, overnight (sleep) gain and the day's events (sleep, activities) with their impact. Up to 366 days per call.",
    inputSchema: { type: "object", properties: { ...range }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); return wrap((await dailyRange(c, r.start, r.end)).map(bodyBatteryDay), { range: r }); },
  },
  {
    name: "get_stress", title: "Stress",
    description: "All-day stress per day: average, max, Garmin's qualifier and minutes at rest/low/medium/high stress. Up to 366 days per call.",
    inputSchema: { type: "object", properties: { ...range }, additionalProperties: false },
    annotations: RO,
    async run(c, a) { const r = resolveRange(a); return wrap((await dailyRange(c, r.start, r.end)).map(stressDay), { range: r }); },
  },
  {
    name: "list_activities", title: "List activities",
    description: "Activities (newest first) in a date range: id, name, type, start, duration, distance, HR, calories, training load, training effect. Use the activity_id with get_activity or download_activity_file.",
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        start_date: { type: "string", description: "First day, YYYY-MM-DD (activity local start). Default: 30 days before end_date." },
        end_date: range.end_date,
        activity_type: { type: "string", description: "Optional Garmin parent type key, e.g. running, cycling, swimming, strength_training, walking." },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50, description: "Max activities to return (default 50, max 500)." },
        ...rawFlag,
      },
    },
    annotations: RO,
    async run(c, a) {
      const r = resolveRange(a, { defaultDays: 30, maxDays: 3660 });
      const rows = await activityList(c, r, { type: a.activity_type, limit: Math.min(Math.max(a.limit ?? 50, 1), 500) });
      return wrap(a.raw ? scrub(rows) : rows.map(activity), { range: r });
    },
  },
  {
    name: "get_activity", title: "Activity details",
    description: "Details for one activity by activity_id: duration, moving time, distance, HR, speed, elevation, power, cadence, calories, training load and effect, Body Battery change.",
    inputSchema: { type: "object", properties: { activity_id: { type: ["integer", "string"], description: "Garmin activity id (from list_activities)." }, ...rawFlag }, required: ["activity_id"], additionalProperties: false },
    annotations: RO,
    async run(c, a) {
      const id = String(a.activity_id ?? "");
      if (!/^\d{1,20}$/.test(id)) throw new GarminError("activity_id must be a number", 0);
      const d = await c.get(`/activity-service/activity/${id}`);
      return { data_source: SOURCE, item: a.raw ? scrub(d) : activityDetail(d || {}) };
    },
  },
  {
    name: "download_activity_file", title: "Download original activity file (.FIT)",
    description: "Downloads the original file Garmin stored for an activity (usually a .zip containing the .FIT) and saves it on this computer. Reads from Garmin only; writes one local file and returns its path.",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["activity_id"],
      properties: {
        activity_id: { type: ["integer", "string"], description: "Garmin activity id (from list_activities)." },
        output_dir: { type: "string", description: "Absolute directory to save into. Default: <system temp>/garmin-personal-data/fit." },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async run(c, a) {
      const id = String(a.activity_id ?? "");
      if (!/^\d{1,20}$/.test(id)) throw new GarminError("activity_id must be a number", 0);
      const dir = a.output_dir ? path.resolve(a.output_dir) : path.join(os.tmpdir(), "garmin-personal-data", "fit");
      const { bytes, contentType } = await c.get(`/download-service/files/activity/${id}`, {}, { raw: true });
      if (!bytes?.length) throw new GarminError("Garmin returned an empty file for this activity (manual activities have no file).", 204);
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      const isFit = bytes.length > 12 && bytes.toString("ascii", 8, 12) === ".FIT";
      const file = path.join(dir, `${id}${isZip ? ".zip" : isFit ? ".fit" : ".bin"}`);
      await mkdir(dir, { recursive: true });
      await writeFile(file, bytes);
      return { data_source: SOURCE, activity_id: Number(id), path: file, bytes: bytes.length, format: isZip ? "zip (contains the original .FIT)" : isFit ? "fit" : contentType || "unknown" };
    },
  },
];
