"use strict";
const {
  CODE_RE, storeReady, query, readBody, sendJson,
  putObject, getObject, listKeys, deleteKeys
} = require("./_lib/store.js");

module.exports = async (req, res) => {
  if (!storeReady()) return sendJson(res, 503, { error: "store-not-connected" });
  const q = query(req);
  const code = (q.get("code") || "").toUpperCase();
  if (!CODE_RE.test(code)) return sendJson(res, 400, { error: "bad-code" });
  const prefix = "teams/" + code + "/state/";

  if (req.method === "GET") {
    const keys = (await listKeys(prefix)).sort();
    if (!keys.length) return sendJson(res, 404, { error: "not-found" });

    // ?list=1 — summarize retained snapshots (recovery history)
    if (q.get("list")) {
      const snapshots = [];
      for (const key of keys) {
        const buf = await getObject(key);
        if (!buf) continue;
        try {
          const doc = JSON.parse(buf.toString("utf8"));
          snapshots.push({
            at: doc.updatedAt,
            sounds: (doc.sounds || []).length,
            players: (doc.players || []).length
          });
        } catch (err) { /* skip corrupt snapshot */ }
      }
      return sendJson(res, 200, { snapshots });
    }

    // ?at=<updatedAt> — fetch a specific retained snapshot
    const at = q.get("at");
    let key = keys[keys.length - 1];
    if (at) {
      if (!/^\d{1,16}$/.test(at)) return sendJson(res, 400, { error: "bad-at" });
      key = prefix + at.padStart(16, "0") + ".json";
      if (keys.indexOf(key) === -1) return sendJson(res, 404, { error: "not-found" });
    }
    const buf = await getObject(key);
    if (!buf) return sendJson(res, 404, { error: "not-found" });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    return res.end(buf);
  }

  if (req.method === "PUT") {
    let doc;
    try {
      doc = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
    } catch (err) {
      return sendJson(res, 400, { error: "bad-body" });
    }
    if (!doc || typeof doc.updatedAt !== "number") return sendJson(res, 400, { error: "bad-doc" });
    const existing = (await listKeys(prefix)).sort();
    if (!existing.length) return sendJson(res, 404, { error: "not-found" }); // must join an existing team
    await putObject(prefix + String(doc.updatedAt).padStart(16, "0") + ".json",
      Buffer.from(JSON.stringify(doc)), "application/json");
    // Keep a healthy history of snapshots (recovery window), prune the rest
    const all = (await listKeys(prefix)).sort();
    if (all.length > 10) await deleteKeys(all.slice(0, all.length - 10));
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 405, { error: "method" });
};
