"use strict";
const {
  CODE_RE, ID_RE, storeReady, query, readBody, sendJson,
  putObject, getObject, getObjectRetry, deleteKeys
} = require("./_lib/store.js");

const MAX_CHUNK = 3.5 * 1024 * 1024; // stay under serverless body limits
const MAX_PARTS = 40;                // ~120 MB per track, far beyond any song

module.exports = async (req, res) => {
  if (!storeReady()) return sendJson(res, 503, { error: "store-not-connected" });
  const q = query(req);
  const code = (q.get("code") || "").toUpperCase();
  const id = q.get("id") || "";
  if (!CODE_RE.test(code) || !ID_RE.test(id)) return sendJson(res, 400, { error: "bad-params" });
  const base = "teams/" + code + "/";
  const trackKey = base + "tracks/" + id;
  const chunkKey = (i) => base + "chunks/" + id + "/" + String(i).padStart(2, "0");

  if (req.method === "PUT") {
    const part = parseInt(q.get("part") || "", 10);
    if (!(part >= 0 && part < MAX_PARTS)) return sendJson(res, 400, { error: "bad-part" });
    let body;
    try {
      body = await readBody(req, MAX_CHUNK);
    } catch (err) {
      return sendJson(res, 413, { error: "chunk-too-large" });
    }
    if (!body.length) return sendJson(res, 400, { error: "empty" });
    await putObject(chunkKey(part), body);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && q.get("finalize")) {
    const parts = parseInt(q.get("parts") || "", 10);
    if (!(parts >= 1 && parts <= MAX_PARTS)) return sendJson(res, 400, { error: "bad-parts" });
    const type = q.get("type") || "application/octet-stream";
    const buffers = [];
    for (let i = 0; i < parts; i++) {
      const buf = await getObjectRetry(chunkKey(i));
      if (!buf) return sendJson(res, 409, { error: "missing-chunk", part: i });
      buffers.push(buf);
    }
    await putObject(trackKey, Buffer.concat(buffers), type);
    await deleteKeys(Array.from({ length: parts }, (_, i) => chunkKey(i)));
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET") {
    const start = parseInt(q.get("start") || "0", 10);
    const len = parseInt(q.get("len") || "0", 10);
    if (!(start >= 0) || !(len > 0 && len <= MAX_CHUNK)) return sendJson(res, 400, { error: "bad-range" });
    const buf = await getObject(trackKey, { start, len });
    if (!buf) return sendJson(res, 404, { error: "not-found" });
    res.statusCode = 200;
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    return res.end(buf);
  }

  sendJson(res, 405, { error: "method" });
};
