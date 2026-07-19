"use strict";
const { storeReady, sendJson, query, putObject, getObject, deleteKeys } = require("./_lib/store.js");

module.exports = async (req, res) => {
  const base = { ok: true, store: storeReady() ? "ready" : "missing" };
  if (!query(req).get("deep") || base.store !== "ready") return sendJson(res, 200, base);
  // Deep probe: prove we can actually write, read back, and delete
  const key = "health/probe";
  try {
    await putObject(key, Buffer.from("ok"), "text/plain");
    const back = await getObject(key);
    await deleteKeys([key]).catch(function () {});
    base.probe = back && back.toString() === "ok" ? "ok" : "read-mismatch";
  } catch (err) {
    base.probe = "failed";
    base.detail = String((err && err.message) || err).slice(0, 300);
  }
  sendJson(res, 200, base);
};
