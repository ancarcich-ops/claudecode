// Storage for team sync. In production this is Vercel Blob (needs a Blob
// store connected to the project, which provides BLOB_READ_WRITE_TOKEN).
// With WALKUP_LOCAL_STORE set it uses the local filesystem instead, which
// is how dev-server.js and the tests run without any cloud setup.
"use strict";

const fs = require("fs");
const path = require("path");

const LOCAL = process.env.WALKUP_LOCAL_STORE;

const CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const ID_RE = /^[a-z0-9-]{3,24}$/;

function blobMod() {
  return import("@vercel/blob");
}

// Tolerate hand-pasted tokens: strip quotes/whitespace and anything after a
// line break (dashboard copy/paste artifacts produce invalid header values).
function blobToken() {
  const raw = process.env.BLOB_READ_WRITE_TOKEN || "";
  return raw.split(/[\r\n]/)[0].replace(/["']/g, "").trim();
}

function localPath(key) {
  const p = path.normalize(path.join(LOCAL, key));
  if (!p.startsWith(path.normalize(LOCAL))) throw new Error("bad key");
  return p;
}

async function putObject(key, buf, contentType) {
  if (LOCAL) {
    const p = localPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    return;
  }
  const { put } = await blobMod();
  const opts = {
    token: blobToken(),
    contentType: contentType || "application/octet-stream",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60
  };
  try {
    await put(key, buf, Object.assign({ access: "public" }, opts));
  } catch (err) {
    // Private-mode Blob stores reject public writes; retry private before failing
    try {
      await put(key, buf, Object.assign({ access: "private" }, opts));
    } catch (err2) {
      throw err; // surface the original error
    }
  }
}

async function getObject(key, range) {
  if (LOCAL) {
    const p = localPath(key);
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    return range ? buf.subarray(range.start, range.start + range.len) : buf;
  }
  const { head } = await blobMod();
  let url;
  try {
    const h = await head(key, { token: blobToken() });
    url = h.downloadUrl || h.url; // downloadUrl carries auth for private stores
  } catch (err) {
    return null;
  }
  const headers = {};
  if (range) headers.range = "bytes=" + range.start + "-" + (range.start + range.len - 1);
  const r = await fetch(url, { headers });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  // If the CDN ignored the Range header we got the whole object back
  if (range && r.status === 200) return buf.subarray(range.start, range.start + range.len);
  return buf;
}

async function getObjectRetry(key, tries) {
  for (let i = 0; i < (tries || 5); i++) {
    const buf = await getObject(key);
    if (buf) return buf;
    await new Promise((res) => setTimeout(res, 400 * (i + 1)));
  }
  return null;
}

async function listObjects(prefix) {
  if (LOCAL) {
    const p = localPath(prefix);
    if (!fs.existsSync(p)) return [];
    return fs.readdirSync(p).map((f) => ({
      key: prefix + f,
      size: fs.statSync(path.join(p, f)).size
    }));
  }
  const { list } = await blobMod();
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, token: blobToken() });
    r.blobs.forEach((b) => out.push({ key: b.pathname, size: b.size }));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function listKeys(prefix) {
  if (LOCAL) {
    const p = localPath(prefix);
    if (!fs.existsSync(p)) return [];
    return fs.readdirSync(p).map((f) => prefix + f);
  }
  const { list } = await blobMod();
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, token: blobToken() });
    r.blobs.forEach((b) => out.push(b.pathname));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function deleteKeys(keys) {
  if (!keys.length) return;
  if (LOCAL) {
    keys.forEach((k) => {
      try { fs.unlinkSync(localPath(k)); } catch (err) { /* already gone */ }
    });
    return;
  }
  const { del } = await blobMod();
  await del(keys, { token: blobToken() });
}

function storeReady() {
  return !!(LOCAL || blobToken());
}

function query(req) {
  return new URL(req.url, "http://localhost").searchParams;
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (d) => {
      size += d.length;
      if (size > maxBytes) { req.destroy(); reject(new Error("too large")); return; }
      chunks.push(d);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = {
  CODE_RE, ID_RE,
  putObject, getObject, getObjectRetry, listKeys, listObjects, deleteKeys,
  storeReady, query, readBody, sendJson
};
