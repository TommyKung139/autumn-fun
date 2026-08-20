// Data-access layer for employee itinerary records.
//
// Two modes, chosen automatically:
//  - "real" mode: when FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
//    are all set (as Vercel env vars), reads/writes go to a Firestore "employees"
//    collection via firebase-admin. This is what production uses.
//  - "mock" mode: when those env vars are absent (e.g. local dev, or before you've
//    set up Firebase yet), reads/writes go to a local JSON file
//    (data/employees.local.json, gitignored) seeded from data/employees.json on
//    first use. This lets the whole app - including the editor / save flow - be
//    developed and tested with `node dev-server.js` without a real Firebase project.
//
// firebase-admin is only `require()`-d inside the real-mode branch, so mock mode
// works even before `npm install` has pulled it in.

const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '..', 'data', 'employees.json');
const LOCAL_PATH = path.join(__dirname, '..', 'data', 'employees.local.json');

function hasFirebaseConfig() {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

// ---------------- real mode (Firestore via firebase-admin) ----------------

// Env vars get pasted by hand into different UIs (Vercel dashboard, shells, .env
// files) which mangle a multi-line PEM key in different ways. Defensively clean up
// the most common mistakes instead of failing with an opaque OpenSSL decoder error:
//  - value pasted with surrounding quote characters included
//  - leading/trailing whitespace or a stray trailing newline
//  - literal two-character "\n" sequences instead of real newlines (this is the
//    normal/expected form when copying straight out of the downloaded JSON key,
//    since JSON itself escapes newlines as \n)
function normalizePrivateKey(raw) {
  let key = (raw || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  if (key.indexOf('\\n') !== -1) {
    key = key.replace(/\\n/g, '\n');
  }
  return key;
}

let _db = null;
function getDb() {
  if (_db) return _db;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
      throw new Error(
        'FIREBASE_PRIVATE_KEY 格式不正確（找不到 "BEGIN PRIVATE KEY" 標頭）。請確認 Vercel 環境變數的值是直接從服務帳戶 JSON 檔的 private_key 欄位完整複製，且沒有多包一層引號。'
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }
  _db = admin.firestore();
  return _db;
}

async function getEmployeeReal(empId) {
  const doc = await getDb().collection('employees').doc(empId).get();
  return doc.exists ? doc.data() : null;
}

// Firestore document IDs are case-sensitive, and at least one record came in from
// the registration sheet with a lower-case employee number (z00039583). Someone
// typing it the normal way would get "查無此員工編號", so try the sensible
// variants before giving up. Returns the stored record, or null.
function idVariants(raw) {
  const s = String(raw || '').trim();
  const upper = s.toUpperCase();
  const lower = s.toLowerCase();
  const out = [s, upper, lower];
  // with / without the leading Z that people often drop or add
  for (const v of [upper, lower]) {
    out.push(v.replace(/^[Zz]/, ''));
    out.push((v.startsWith('Z') || v.startsWith('z') ? '' : 'Z') + v);
    out.push((v.startsWith('Z') || v.startsWith('z') ? '' : 'z') + v);
  }
  return [...new Set(out.filter(Boolean))];
}

async function findEmployeesByNameReal(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  const col = getDb().collection('employees');
  const found = new Map();
  // Exact match, then a prefix range scan. U+F8FF sorts above any normal
  // character, so [q, q+U+F8FF) means "name starts with q" - that is what lets
  // someone type 林芝萱 and still reach 林芝萱(Chih). Both are indexed queries,
  // so they cost one read per matching document, not a whole-collection scan.
  const exact = await col.where('name', '==', q).get();
  exact.docs.forEach((d) => found.set(d.id, d.data()));
  const prefix = await col
    .where('name', '>=', q)
    .where('name', '<', q + '\uf8ff')
    .limit(25)
    .get();
  prefix.docs.forEach((d) => found.set(d.id, d.data()));
  return [...found.values()];
}

async function updateEmployeeReal(empId, patch) {
  const ref = getDb().collection('employees').doc(empId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return updated.data();
}

// Returns the created record, or null if that employee ID is already taken.
async function createEmployeeReal(record) {
  const ref = getDb().collection('employees').doc(record.emp_id);
  const existing = await ref.get();
  if (existing.exists) return null;
  await ref.set(record);
  return record;
}

// Reads the whole collection. Used to build the seating/coach/table charts, which
// are derived from the live records rather than from a static export, so any seat
// moved through the editor shows up on the charts too.
async function listEmployeesReal() {
  const snap = await getDb().collection('employees').get();
  return snap.docs.map((d) => d.data());
}

// ---------------- mock mode (local JSON file) ----------------

function loadLocalStore() {
  if (!fs.existsSync(LOCAL_PATH)) {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(seed, null, 1), 'utf8');
  }
  return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
}

function saveLocalStore(list) {
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(list, null, 1), 'utf8');
}

async function getEmployeeMock(empId) {
  const list = loadLocalStore();
  return list.find((e) => e.emp_id === empId) || null;
}

async function updateEmployeeMock(empId, patch) {
  const list = loadLocalStore();
  const idx = list.findIndex((e) => e.emp_id === empId);
  if (idx === -1) return null;
  list[idx] = Object.assign({}, list[idx], patch);
  saveLocalStore(list);
  return list[idx];
}

async function createEmployeeMock(record) {
  const list = loadLocalStore();
  if (list.some((e) => e.emp_id === record.emp_id)) return null;
  list.push(record);
  saveLocalStore(list);
  return record;
}

async function listEmployeesMock() {
  return loadLocalStore();
}

async function findEmployeesByNameMock(name) {
  const q = String(name || '').trim();
  if (!q) return [];
  return loadLocalStore().filter((e) => String(e.name || '').indexOf(q) !== -1);
}

// ---------------- public API ----------------

async function getEmployee(empId) {
  return hasFirebaseConfig() ? getEmployeeReal(empId) : getEmployeeMock(empId);
}

async function updateEmployee(empId, patch) {
  return hasFirebaseConfig() ? updateEmployeeReal(empId, patch) : updateEmployeeMock(empId, patch);
}

async function createEmployee(record) {
  return hasFirebaseConfig() ? createEmployeeReal(record) : createEmployeeMock(record);
}

async function listEmployees() {
  return hasFirebaseConfig() ? listEmployeesReal() : listEmployeesMock();
}

async function findEmployeesByName(name) {
  return hasFirebaseConfig() ? findEmployeesByNameReal(name) : findEmployeesByNameMock(name);
}

// Resolves whatever the user typed into the actual stored record, tolerating the
// upper/lower-case and leading-Z variations described above.
// Returns { empId, record } using the ID the record is really stored under, or null.
async function resolveEmployee(rawId) {
  for (const candidate of idVariants(rawId)) {
    const record = await getEmployee(candidate);
    if (record) return { empId: candidate, record };
  }
  return null;
}

module.exports = {
  getEmployee, updateEmployee, createEmployee, listEmployees,
  findEmployeesByName, resolveEmployee, hasFirebaseConfig,
};
