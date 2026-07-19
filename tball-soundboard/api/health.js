"use strict";
const { storeReady, sendJson } = require("./_lib/store.js");

module.exports = async (req, res) => {
  sendJson(res, 200, { ok: true, store: storeReady() ? "ready" : "missing" });
};
