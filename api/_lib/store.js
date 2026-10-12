/* A small shared store for the dashboard's snapshot, so every Vercel function instance serves the same snapshot
   and only one of them refreshes it at a time (PostHog runs 3 queries of a project at once and allows 2,400 an
   hour; separate per-instance caches multiplied both).

   Uses Upstash Redis over its REST API when Vercel has it connected (Storage > Upstash for Redis, or the older
   Vercel KV): KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
   Without them, available() is false and the caller keeps its per-instance cache. Every call fails soft: a store
   that doesn't answer is treated as empty, never as an error on the page. */
"use strict";

const URL_ = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

function available() {
  return !!(URL_ && TOKEN);
}

async function command(args) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  try {
    const r = await fetch(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    return (await r.json()).result;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(key) {
  if (!available()) return null;
  const v = await command(["GET", key]);
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

async function setJson(key, value, seconds) {
  if (!available()) return false;
  return (await command(["SET", key, JSON.stringify(value), "EX", String(seconds)])) === "OK";
}

/* true when this caller got the lock (it then refreshes); it expires by itself after `seconds` */
async function lock(key, id, seconds) {
  if (!available()) return true;
  return (await command(["SET", key, id, "NX", "EX", String(seconds)])) === "OK";
}

async function unlock(key, id) {
  if (!available()) return;
  /* only our own lock: a slow refresh whose lock already expired must not free someone else's */
  await command(["EVAL", "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", "1", key, id]);
}

module.exports = { available, getJson, setJson, lock, unlock };
