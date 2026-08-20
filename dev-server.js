// Local-only test server (NOT deployed) to sanity-check the /api handlers
// before pushing to Vercel. Mimics Vercel's Node function req/res shape closely enough
// for manual testing: node dev-server.js, then curl http://localhost:3131/...
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

process.env.SITE_PASSWORD = process.env.SITE_PASSWORD || 'testpass';
process.env.EDITOR_PASSWORD = process.env.EDITOR_PASSWORD || 'editortest';
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'test-secret';
// No FIREBASE_* env vars set here on purpose: lib/firestore.js falls back to a
// local JSON-file-backed mock store (data/employees.local.json) so the whole app,
// including the editor save flow, can be exercised without a real Firebase project.

const login = require('./api/login');
const editorLogin = require('./api/editor-login');
const verify = require('./api/verify');
const lookup = require('./api/lookup');
const reference = require('./api/reference');
const charts = require('./api/charts');
const employeeUpdate = require('./api/employee-update');
const employeeCreate = require('./api/employee-create');

const routes = {
  '/api/login': login,
  '/api/editor-login': editorLogin,
  '/api/verify': verify,
  '/api/lookup': lookup,
  '/api/reference': reference,
  '/api/charts': charts,
  '/api/employee-update': employeeUpdate,
  '/api/employee-create': employeeCreate,
};

function augmentRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
  return res;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  augmentRes(res);

  const handler = routes[parsed.pathname];
  if (handler) {
    let bodyChunks = [];
    req.on('data', (c) => bodyChunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(bodyChunks).toString('utf8');
      req.query = parsed.query;
      if (raw) {
        try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; }
      } else {
        req.body = {};
      }
      handler(req, res);
    });
    return;
  }

  // static files
  let filePath = path.join(__dirname, parsed.pathname === '/' ? '/index.html' : parsed.pathname);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.end(data);
  });
});

server.listen(3131, () => console.log('dev server on http://localhost:3131'));
