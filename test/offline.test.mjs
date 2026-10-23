// Offline tests: a fake Garmin (no network, no key needed).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client, chunks, resolveRange, readKey, keyInfo, jwtExp } from "../server/client.mjs";
import { makeHandler } from "../server/index.mjs";
import { TOOLS } from "../server/tools.mjs";

const KEY = "test-key-0123456789abcdef";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "RS256" })}.${b64({ exp: Math.floor(Date.now() / 1000) + 86400, sub: "x" })}.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;

function fakeGarmin(routes) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url); calls.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), auth: opts.headers?.Authorization });
    if (u.pathname.endsWith("/personal-api-key/token")) return new Response(TOKEN, { status: 200 });
    for (const [re, fn] of routes) if (re.test(u.pathname)) return fn(u, calls);
    return new Response("not found", { status: 404 });
  };
  return { calls, fetchImpl };
}
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers });
const mk = (fetchImpl) => new Client({ env: { GARMIN_PERSONAL_API_KEY: KEY }, fetchImpl, pauseMs: 0, wait: async () => {} });

test("chunks respect per-endpoint limits and cover the range exactly", () => {
  const c = chunks("2026-01-01", "2026-03-01", 31);
  assert.deepEqual(c[0], ["2026-01-01", "2026-01-31"]);
  assert.equal(c.at(-1)[1], "2026-03-01");
  for (const [s, e] of c) assert.ok((Date.parse(e) - Date.parse(s)) / 864e5 + 1 <= 31);
  assert.equal(chunks("2026-10-23", "2026-10-23", 28).length, 1);
});

test("date validation", () => {
  assert.throws(() => resolveRange({ start_date: "2026-13-01", end_date: "2026-12-01" }));
  assert.throws(() => resolveRange({ start_date: "2026-10-05", end_date: "2026-10-01" }));
  assert.throws(() => resolveRange({ start_date: "2024-01-01", end_date: "2026-01-01" }));
  assert.equal(resolveRange({ end_date: "2026-10-23" }).start, "2026-10-17");
});

test("missing or unexpanded key gives setup help, no request", async () => {
  assert.equal(readKey({ GARMIN_PERSONAL_API_KEY: "${GARMIN_PERSONAL_API_KEY}" }), null);
  const { calls, fetchImpl } = fakeGarmin([]);
  const h = makeHandler(new Client({ env: {}, fetchImpl, pauseMs: 0 }));
  const r = await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_sleep", arguments: {} } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /personalApiToken/);
  assert.equal(calls.length, 0);
});

test("one token exchange is reused; bearer is sent; JWT exp is parsed", async () => {
  const { calls, fetchImpl } = fakeGarmin([[/dailysummaries/, () => json({ data: [] })]]);
  const c = mk(fetchImpl);
  await c.get("/usersummary-service/v2/dailysummaries"); await c.get("/usersummary-service/v2/dailysummaries");
  assert.equal(c.stats.token_exchanges, 1);
  assert.equal(calls[0].auth, `ApiKey ${KEY}`);
  assert.equal(calls[1].auth, `Bearer ${TOKEN}`);
  assert.ok(jwtExp(TOKEN) > Date.now());
});

test("429 is retried honouring Retry-After; 401 triggers one re-exchange", async () => {
  let n = 0, m = 0;
  const { fetchImpl } = fakeGarmin([
    [/hrv/, () => (++n === 1 ? new Response("slow down", { status: 429, headers: { "Retry-After": "1" } }) : json({ hrvSummaries: [] }))],
    [/activity-service/, () => (++m === 1 ? new Response("", { status: 401 }) : json({ activityId: 1, summaryDTO: {} }))],
  ]);
  const c = mk(fetchImpl);
  await c.get("/hrv-service/hrv/daily/2026-10-01/2026-10-02");
  assert.equal(c.stats.throttled, 1);
  await c.get("/activity-service/activity/1");
  assert.equal(c.stats.token_exchanges, 2);
});

test("errors never contain the key or the token", async () => {
  const { fetchImpl } = fakeGarmin([[/sleep/, () => new Response(`bad ${KEY} ${TOKEN}`, { status: 400 })]]);
  const h = makeHandler(mk(fetchImpl));
  const r = await h({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sleep", arguments: { start_date: "2026-10-01", end_date: "2026-10-02" } } });
  const text = r.result.content[0].text;
  assert.equal(r.result.isError, true);
  assert.ok(!text.includes(KEY) && !text.includes(TOKEN), text);
  assert.match(text, /REDACTED/);
});

test("long ranges are chunked to Garmin's limits and shaped", async () => {
  const { calls, fetchImpl } = fakeGarmin([
    [/dailySleepSummariesByDate/, (u) => json([{ calendarDate: u.searchParams.get("startDate"), sleepTimeSeconds: 27059, sleepStartTimestampLocal: Date.UTC(2026, 9, 1, 23, 5), sleepScores: { overall: { value: 81, qualifierKey: "GOOD" } } }])],
  ]);
  const h = makeHandler(mk(fetchImpl));
  const r = await h({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_sleep", arguments: { start_date: "2026-07-01", end_date: "2026-10-01" } } });
  const sleepCalls = calls.filter((c) => c.path.includes("dailySleep"));
  assert.equal(sleepCalls.length, 3);   // 93 days / 31
  const first = r.result.structuredContent.items[0];
  assert.deepEqual([first.duration_min, first.score, first.start_local], [450, 81, "2026-10-01 23:05"]);
  assert.equal(r.result.structuredContent.data_source, "Garmin");
});

test("MCP handshake and tools/list", async () => {
  const h = makeHandler(mk(fakeGarmin([]).fetchImpl));
  const init = await h({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(await h({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const list = await h({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = list.result.tools.map((t) => t.name);
  assert.deepEqual(names, TOOLS.map((t) => t.name));
  for (const t of list.result.tools) if (t.name !== "download_activity_file") assert.equal(t.annotations.readOnlyHint, true);
});

test("GARMIN_PERSONAL_API_KEY_FILE: key read from file; env var wins; unreadable file explained", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gpd-test-"));
  const f = path.join(dir, "key");
  await writeFile(f, `# my Garmin key\n${KEY}\n`, { mode: 0o600 });
  assert.deepEqual([keyInfo({ GARMIN_PERSONAL_API_KEY_FILE: f }).key, keyInfo({ GARMIN_PERSONAL_API_KEY_FILE: f }).source], [KEY, "file"]);
  assert.equal(readKey({ GARMIN_PERSONAL_API_KEY: "direct", GARMIN_PERSONAL_API_KEY_FILE: f }), "direct");
  assert.equal(readKey({ GARMIN_PERSONAL_API_KEY: "${GARMIN_PERSONAL_API_KEY}", GARMIN_PERSONAL_API_KEY_FILE: f }), KEY);
  const empty = path.join(dir, "empty"); await writeFile(empty, "\n");
  assert.match(keyInfo({ GARMIN_PERSONAL_API_KEY_FILE: empty }).error, /empty/);
  // A file-based key is used for the exchange and redacted like an env key.
  const { calls, fetchImpl } = fakeGarmin([[/sleep/, () => new Response(`bad ${KEY}`, { status: 400 })]]);
  const h = makeHandler(new Client({ env: { GARMIN_PERSONAL_API_KEY_FILE: f }, fetchImpl, pauseMs: 0, wait: async () => {} }));
  const r = await h({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_sleep", arguments: { start_date: "2026-10-01", end_date: "2026-10-01" } } });
  assert.equal(calls[0].auth, `ApiKey ${KEY}`);
  assert.ok(!r.result.content[0].text.includes(KEY));
  // Missing file: setup help names the file problem, no request is made.
  const g = fakeGarmin([]);
  const h2 = makeHandler(new Client({ env: { GARMIN_PERSONAL_API_KEY_FILE: path.join(dir, "nope") }, fetchImpl: g.fetchImpl, pauseMs: 0 }));
  const r2 = await h2({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_hrv", arguments: {} } });
  assert.equal(r2.result.isError, true);
  assert.match(r2.result.content[0].text, /could not be read \(ENOENT\)/);
  assert.equal(g.calls.length, 0);
});

test("setup help is client-neutral and mentions both ways to pass the key", async () => {
  const { SETUP_HELP } = await import("../server/client.mjs");
  assert.match(SETUP_HELP, /GARMIN_PERSONAL_API_KEY_FILE/);
  assert.match(SETUP_HELP, /MCP client/);
});

test("auth_status: not configured, accepted, rejected, and check=false; never leaks the key", async () => {
  const call = async (client, args = {}) => (await makeHandler(client)({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "auth_status", arguments: args } })).result;
  const none = fakeGarmin([]);
  const r0 = await call(new Client({ env: {}, fetchImpl: none.fetchImpl, pauseMs: 0 }));
  assert.equal(r0.isError, false);
  assert.deepEqual([r0.structuredContent.key_configured, r0.structuredContent.key_accepted, none.calls.length], [false, null, 0]);
  assert.match(r0.structuredContent.next_step, /personalApiToken/);

  const ok = fakeGarmin([]);
  const r1 = await call(mk(ok.fetchImpl));
  const s1 = r1.structuredContent;
  assert.deepEqual([s1.key_configured, s1.key_source, s1.checked, s1.key_accepted, s1.key_expires_at], [true, "env", true, true, null]);
  assert.ok(Date.parse(s1.access_token_expires_at) > Date.now());
  assert.match(s1.key_expiry_note, /does not report/);
  assert.ok(!r1.content[0].text.includes(KEY) && !r1.content[0].text.includes(TOKEN));

  const rej = async () => new Response("expired", { status: 403 });
  const s2 = (await call(new Client({ env: { GARMIN_PERSONAL_API_KEY: KEY }, fetchImpl: rej, pauseMs: 0, wait: async () => {} }))).structuredContent;
  assert.deepEqual([s2.key_configured, s2.key_accepted], [true, false]);
  assert.match(s2.next_step, /Create a new key/);

  const quiet = fakeGarmin([]);
  const s3 = (await call(mk(quiet.fetchImpl), { check: false })).structuredContent;
  assert.deepEqual([s3.checked, s3.key_accepted, quiet.calls.length], [false, null, 0]);
});
