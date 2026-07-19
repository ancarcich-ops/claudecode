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
    const buf = await getObject(keys[keys.length - 1]);
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
    // Keep the newest few snapshots, prune the rest
    const all = (await listKeys(prefix)).sort();
    if (all.length > 3) await deleteKeys(all.slice(0, all.length - 3));
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 405, { error: "method" });
};
