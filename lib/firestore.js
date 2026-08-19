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

let _db = null;
function getDb() {
  if (_db) return _db;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel env vars store literal "\n" - convert back to real newlines.
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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

async function updateEmployeeReal(empId, patch) {
  const ref = getDb().collection('employees').doc(empId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return updated.data();
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

// ---------------- public API ----------------

async function getEmployee(empId) {
  return hasFirebaseConfig() ? getEmployeeReal(empId) : getEmployeeMock(empId);
}

async function updateEmployee(empId, patch) {
  return hasFirebaseConfig() ? updateEmployeeReal(empId, patch) : updateEmployeeMock(empId, patch);
}

module.exports = { getEmployee, updateEmployee, hasFirebaseConfig };
