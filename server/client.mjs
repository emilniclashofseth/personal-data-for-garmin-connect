// Garmin Connect Personal API client: key -> 24 h access token, GET with retry, date chunking.
// Community code, not made or endorsed by Garmin. Never logs the API key or the access token.
import { readFileSync } from "node:fs";

export const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

export const KEY_PAGE = "https://connect.garmin.com/app/settings/personalApiToken";
export const SETUP_HELP =
  "No Garmin Personal API key is configured. Create one at " + KEY_PAGE + " " +
  "(Garmin's steps: https://developer.garmin.com/gc-developer-program/personal/personal-api/), then give it to this " +
  "MCP server through your MCP client's settings for it: either GARMIN_PERSONAL_API_KEY=<key>, or " +
  "GARMIN_PERSONAL_API_KEY_FILE=<absolute path to a file that holds only the key>. Restart or reload the server " +
  "afterwards (for example in Cursor: Plugins -> Personal Data for Garmin Connect (community) -> Configure, then reload " +
  "the window). Never paste the key into chat.";
export const RENEW_HELP =
  "Create a new key at " + KEY_PAGE + ", put it where this server reads it (GARMIN_PERSONAL_API_KEY in your MCP " +
  "client's settings, or the file named by GARMIN_PERSONAL_API_KEY_FILE), then restart or reload the server.";

export class GarminError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// An unexpanded placeholder (e.g. "${GARMIN_PERSONAL_API_KEY}") means the client did not substitute the variable.
const unset = (v) => { const s = String(v ?? "").trim(); return !s || /^\$\{.*\}$/.test(s) ? null : s; };

/**
 * Where the key comes from. GARMIN_PERSONAL_API_KEY wins if it is set; otherwise GARMIN_PERSONAL_API_KEY_FILE names a
 * file whose first non-empty line is the key (keeps the key out of MCP client configs). Never throws.
 * Returns { key, source: "env" | "file" | null, file, error }.
 */
export function keyInfo(env = process.env) {
  const direct = unset(env.GARMIN_PERSONAL_API_KEY);
  if (direct) return { key: direct, source: "env", file: null, error: null };
  const file = unset(env.GARMIN_PERSONAL_API_KEY_FILE);
  if (!file) return { key: null, source: null, file: null, error: null };
  try {
    const line = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    return line ? { key: line, source: "file", file, error: null }
      : { key: null, source: "file", file, error: `GARMIN_PERSONAL_API_KEY_FILE (${file}) is empty.` };
  } catch (e) {
    return { key: null, source: "file", file, error: `GARMIN_PERSONAL_API_KEY_FILE (${file}) could not be read (${e.code || "error"}).` };
  }
}

export function readKey(env = process.env) { return keyInfo(env).key; }

export function jwtExp(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof p.exp === "number" ? p.exp * 1000 : null;
  } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Client {
  constructor({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now(), pauseMs = 250, maxRetries = 3, wait = sleep } = {}) {
    this.env = env; this.fetch = fetchImpl; this.now = now; this.pauseMs = pauseMs; this.maxRetries = maxRetries; this.wait = wait;
    this.token = null; this.obtainedAt = 0; this.expiresAt = 0; this.lastCall = 0;
    this.stats = { requests: 0, token_exchanges: 0, throttled: 0, retries: 0 };
  }

  redact(text) {
    let s = String(text ?? "");
    const key = readKey(this.env);
    if (key) s = s.split(key).join("[REDACTED_KEY]");
    if (this.token) s = s.split(this.token).join("[REDACTED_TOKEN]");
    return s.replace(JWT_RE, "[REDACTED_TOKEN]");
  }

  async exchange() {
    const { key, error } = keyInfo(this.env);
    if (!key) throw new GarminError(error ? `${error} ${SETUP_HELP}` : SETUP_HELP, 0);
    this.stats.token_exchanges++;
    const res = await this.fetch(BASE + TOKEN_PATH, { method: "POST", headers: { Authorization: `ApiKey ${key}`, Accept: "*/*" } });
    const body = (await res.text()).trim();
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403
        ? ` The key was rejected: it may have expired or been deleted. ${RENEW_HELP}`
        : "";
      throw new GarminError(`Token exchange failed: HTTP ${res.status}.${hint} ${this.redact(body).slice(0, 200)}`.trim(), res.status);
    }
    // Garmin returns the access token as plain text (a JWT); tolerate a JSON wrapper too.
    let tok = body;
    if (body.startsWith("{")) { try { const j = JSON.parse(body); tok = j.access_token || j.accessToken || j.token || ""; } catch { /* keep text */ } }
    if (!tok || tok.split(".").length !== 3) throw new GarminError("Token exchange returned an unexpected body (not a token).", res.status);
    this.token = tok; this.obtainedAt = this.now();
    this.expiresAt = jwtExp(tok) ?? this.obtainedAt + 24 * 3600e3;
  }

  async ensureToken() {
    const t = this.now();
    if (!this.token || t - this.obtainedAt > 23 * 3600e3 || this.expiresAt - t < 3600e3) await this.exchange();
    return this.token;
  }

  /**
   * Key status for the auth_status tool. With check=true it does one fresh token exchange, which is the only way the
   * Personal API tells us whether the key is accepted right now. Garmin's API does not report the key's own expiry
   * date (only the settings page shows it), so key_expires_at is always null rather than a guess.
   */
  async status({ check = true } = {}) {
    const info = keyInfo(this.env);
    const out = {
      key_configured: Boolean(info.key), key_source: info.source, key_file: info.file, key_problem: info.error,
      checked: false, key_accepted: null, access_token_expires_at: null,
      key_expires_at: null,
      key_expiry_note: `Garmin's Personal API does not report when the key itself expires. See its status and expiry date at ${KEY_PAGE}; Garmin also emails you about a week before it expires.`,
      next_step: null,
    };
    if (!info.key) { out.next_step = info.error ? `${info.error} ${SETUP_HELP}` : SETUP_HELP; return out; }
    if (!check) return out;
    out.checked = true;
    try {
      this.token = null;
      await this.exchange();
      out.key_accepted = true;
      out.access_token_expires_at = new Date(this.expiresAt).toISOString();
    } catch (e) {
      if (e instanceof GarminError && (e.status === 401 || e.status === 403)) { out.key_accepted = false; out.next_step = RENEW_HELP; }
      else out.check_error = this.redact(e?.message || e);
    }
    return out;
  }

  async get(path, query = {}, { raw = false } = {}) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    const url = BASE + path + (qs ? `?${qs}` : "");
    let reauthed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.ensureToken();
      const gap = this.now() - this.lastCall;
      if (gap < this.pauseMs) await this.wait(this.pauseMs - gap);
      this.lastCall = this.now(); this.stats.requests++;
      let res;
      try {
        res = await this.fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: raw ? "*/*" : "application/json" } });
      } catch (e) {
        if (attempt < this.maxRetries) { this.stats.retries++; await this.wait(1000 * 2 ** attempt); continue; }
        throw new GarminError(`Network error calling ${path}: ${this.redact(e.message)}`, 0);
      }
      if (res.status === 401 && !reauthed) { reauthed = true; this.token = null; continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < this.maxRetries) {
        if (res.status === 429) this.stats.throttled++;
        this.stats.retries++;
        const ra = Number(res.headers?.get?.("retry-after"));
        await this.wait(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt, 30000));
        continue;
      }
      if (res.status === 204) return raw ? Buffer.alloc(0) : null;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const why = res.status === 429 ? " Rate limited by Garmin; try again in a few minutes or use a shorter date range." :
          res.status === 400 ? " Garmin rejected the request (often a date range longer than this endpoint allows)." :
          res.status === 401 || res.status === 403 ? ` Not authorised: the key may have expired or been revoked. ${RENEW_HELP}` : "";
        throw new GarminError(`GET ${path} failed: HTTP ${res.status}.${why} ${this.redact(text).slice(0, 200)}`.trim(), res.status);
      }
      if (raw) return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers?.get?.("content-type") || "" };
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
  }
}

// ---- dates
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isoDay(d) { return d.toISOString().slice(0, 10); }
export function addDays(s, n) { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }
export function localToday() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resolveRange(args = {}, { defaultDays = 7, maxDays = 366 } = {}) {
  const end = args.end_date || localToday();
  const start = args.start_date || addDays(end, -(defaultDays - 1));
  for (const [n, v] of [["start_date", start], ["end_date", end]])
    if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v + "T00:00:00Z"))) throw new GarminError(`${n} must be YYYY-MM-DD (got ${JSON.stringify(v)})`, 0);
  if (start > end) throw new GarminError("start_date is after end_date", 0);
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1;
  if (days > maxDays) throw new GarminError(`Range is ${days} days; the maximum per call is ${maxDays}. Split it into smaller ranges.`, 0);
  return { start, end, days };
}

// Split [start, end] into inclusive chunks of at most `size` days (Garmin's per-endpoint limits).
export function chunks(start, end, size) {
  const out = [];
  for (let s = start; s <= end; s = addDays(s, size)) {
    const e = addDays(s, size - 1);
    out.push([s, e < end ? e : end]);
  }
  return out;
}
