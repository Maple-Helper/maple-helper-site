"use strict";
/* Everything the clean players page (/admin/players/) shows: app 0.18.1+ only (api/_lib/players.js). */
const auth = require("../_lib/auth");
const sources = require("../_lib/sources");
const players = require("../_lib/players");

const TTL_MS = 2 * 60 * 1000;      // ~8 PostHog queries a refresh; its limit is 2400 an hour
const MIN_FORCE_MS = 30 * 1000;
let cache = null;

module.exports = async function playersStats(req, res) {
  auth.noStore(res);
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  if (!auth.isAdmin(req)) {
    return res.status(401).json({
      error: "unauthorized", configured: auth.configured(), reason: auth.setupProblem(), env: process.env.VERCEL_ENV || "local",
    });
  }
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  const project = process.env.POSTHOG_PROJECT_ID;
  if (!key || !project) return res.status(200).json({ configured: false });
  const host = (process.env.POSTHOG_HOST || "https://us.posthog.com").replace(/\/$/, "");

  const age = cache ? Date.now() - cache.at : Infinity;
  const force = req.query && req.query.fresh === "1" && age > MIN_FORCE_MS;
  if (!cache || age > TTL_MS || force) {
    try {
      const data = await players.run((q) => sources.hogql(host, project, key, q));
      cache = { at: Date.now(), data: { configured: true, generatedAt: new Date().toISOString(), ...data } };
    } catch (e) {
      return res.status(200).json({ configured: true, generatedAt: new Date().toISOString(), errors: [e.message || String(e)] });
    }
  }
  return res.status(200).json(cache.data);
};
