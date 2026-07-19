// Local dev server mirroring the Vercel layout: index.html as the static
// page, api/*.js as functions. Uses filesystem storage (WALKUP_LOCAL_STORE)
// so no cloud credentials are needed. Run: node dev-server.js
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

process.env.WALKUP_LOCAL_STORE =
  process.env.WALKUP_LOCAL_STORE || path.join(__dirname, ".local-store");

const ROUTES = { health: true, team: true, state: true, track: true };
const PORT = process.env.PORT || 3799;

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (m && ROUTES[m[1]]) {
    Promise.resolve(require("./api/" + m[1] + ".js")(req, res)).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err && err.message) }));
    });
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(PORT, () => {
  console.log("Walk-Up! dev server: http://localhost:" + PORT +
    " (storage: " + process.env.WALKUP_LOCAL_STORE + ")");
});
