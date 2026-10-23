// Live, read-only smoke test against YOUR account. Skipped unless GARMIN_LIVE=1 and a key is set.
// Prints only counts and field names, never values of the key/token.
import test from "node:test";
import assert from "node:assert/strict";
import { Client, readKey, addDays, localToday } from "../server/client.mjs";
import { makeHandler } from "../server/index.mjs";

const live = process.env.GARMIN_LIVE === "1" && readKey();
test("live: daily summaries, sleep, activities", { skip: !live && "set GARMIN_LIVE=1 and GARMIN_PERSONAL_API_KEY" }, async () => {
  const client = new Client(); const h = makeHandler(client);
  const end = localToday(), start = addDays(end, -6);
  const call = async (name, args) => {
    const r = await h({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } });
    assert.equal(r.result.isError, false, r.result.content[0].text);
    return r.result.structuredContent;
  };
  const days = await call("get_daily_summaries", { start_date: start, end_date: end });
  const sleep = await call("get_sleep", { start_date: start, end_date: end });
  const acts = await call("list_activities", { limit: 3 });
  assert.ok(days.count >= 1 && sleep.count >= 1);
  console.log(JSON.stringify({ days: days.count, nights: sleep.count, activities: acts.count, stats: client.stats }));
});
