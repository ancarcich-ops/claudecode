"use strict";
const { storeReady, readBody, sendJson, putObject } = require("./_lib/store.js");

// Unambiguous alphabet: no 0/O/1/I. 30^8 combinations — unguessable in practice.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  let s = "";
  for (let i = 0; i < 8; i++) s += pick();
  return s.slice(0, 4) + "-" + s.slice(4);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method" });
  if (!storeReady()) return sendJson(res, 503, { error: "store-not-connected" });
  let doc;
  try {
    doc = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString("utf8"));
  } catch (err) {
    return sendJson(res, 400, { error: "bad-body" });
  }
  if (!doc || typeof doc.updatedAt !== "number") return sendJson(res, 400, { error: "bad-doc" });
  const code = makeCode();
  const key = "teams/" + code + "/state/" + String(doc.updatedAt).padStart(16, "0") + ".json";
  try {
    await putObject(key, Buffer.from(JSON.stringify(doc)), "application/json");
  } catch (err) {
    return sendJson(res, 503, { error: "store-not-connected" });
  }
  sendJson(res, 200, { code });
};
