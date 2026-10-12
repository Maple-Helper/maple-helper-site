"use strict";
const crypto = require("crypto");
const auth = require("../_lib/auth");
const sources = require("../_lib/sources");
const store = require("../_lib/store");

/* One snapshot for 2 minutes: the dashboard refreshes itself and several managers may have it open, but GitHub
   (60 calls/hour without a token) and PostHog (3 queries at once, 2,400 an hour) mustn't be hit on every request.
   With Upstash Redis connected (api/_lib/store.js) the snapshot and a refresh lock are shared by every function
   instance, so only one refresh runs at a time across all of them; without it each instance keeps its own. */
const TTL_MS = 2 * 60 * 1000;          // 14 PostHog queries a refresh
const MIN_FORCE_MS = 30 * 1000;        // the Refresh button: a new snapshot if the shown one is 30 s+ old
const ERROR_TTL_MS = 60 * 1000;        // a snapshot with failed parts: the next try a minute later
const KEEP_COMPLETE_MS = 10 * 60 * 1000;
const SNAP_KEY = "mh:admin:snapshot";
const LOCK_KEY = "mh:admin:refresh";
const LOCK_S = 70;                     // longer than a refresh can take (the queries stop at 45 s, maxDuration 60 s)
let cache = null;                      // { at, data, partial, retryAt }
let inflight = null;

async function settle(name, fn) {
  try {
    return await fn();
  } catch (e) {
    return { configured: true, error: e.message || String(e) };
  }
}

async function snapshot() {
  const [github, uptime, posthog, vercel] = await Promise.all([
    settle("github", sources.github),
    settle("uptime", sources.uptime),
    settle("posthog", sources.posthog),
    settle("vercel", sources.vercel),
  ]);
  return { generatedAt: new Date().toISOString(), github, uptime, posthog, vercel };
}

const isPartial = (data) => !!(data.posthog && ((data.posthog.errors && data.posthog.errors.length) || data.posthog.error));

/* the new snapshot, or the previous complete one (marked with its time) when the new one has failed parts and the
   complete one is less than 10 minutes old */
function next(prev, data) {
  const partial = isPartial(data);
  if (partial && prev && !prev.partial && Date.now() - prev.at < KEEP_COMPLETE_MS) {
    return { ...prev, data: { ...data, posthog: prev.data.posthog, staleSince: prev.data.staleSince || prev.data.generatedAt }, retryAt: Date.now() };
  }
  return { at: Date.now(), data, partial };
}

function due(entry, force) {
  if (!entry) return true;
  const age = Date.now() - entry.at;
  if (entry.retryAt && Date.now() - entry.retryAt < ERROR_TTL_MS) return false;
  return age > (entry.partial ? ERROR_TTL_MS : TTL_MS) || (force && age > MIN_FORCE_MS);
}

async function refreshShared(force) {
  const shared = await store.getJson(SNAP_KEY);
  if (shared && !due(shared, force)) return shared;
  const id = crypto.randomBytes(8).toString("hex");
  if (!(await store.lock(LOCK_KEY, id, LOCK_S))) {
    /* another instance is refreshing: serve what there is, or wait for its result */
    if (shared) return shared;
    for (let i = 0; i < 20; i++) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const s = await store.getJson(SNAP_KEY);
      if (s) return s;
    }
    return null;
  }
  try {
    const entry = next(shared, await snapshot());
    await store.setJson(SNAP_KEY, entry, 24 * 3600);
    return entry;
  } finally {
    await store.unlock(LOCK_KEY, id);
  }
}

module.exports = async function stats(req, res) {
  auth.noStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  if (!auth.isAdmin(req)) {
    return res.status(401).json({
      error: "unauthorized", configured: auth.configured(), reason: auth.setupProblem(), env: process.env.VERCEL_ENV || "local",
    });
  }

  const force = !!(req.query && req.query.fresh === "1");
  if (due(cache, force)) {
    /* two requests at expiry in this instance share one refresh */
    if (!inflight) {
      inflight = (async () => {
        if (store.available()) {
          const entry = await refreshShared(force);
          if (entry) { cache = entry; return; }
        }
        cache = next(cache, await snapshot());
      })().finally(() => { inflight = null; });
    }
    await inflight;
  }
  return res.status(200).json(cache.data);
};
