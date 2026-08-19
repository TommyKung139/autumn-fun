// One-time (or re-runnable) migration script: imports data/employees.json into a
// real Firebase Firestore project, collection "employees", document ID = emp_id.
//
// Usage (run on your own machine where `npm install` works, NOT in this sandbox):
//   npm install firebase-admin
//   FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY="..." \
//     node scripts/seed_firestore.js
//
// The three FIREBASE_* env vars are the same ones the deployed app uses (see
// README.md "Firebase 設定" section) — get them from your Firebase service
// account JSON key (projectId / clientEmail / privateKey fields).
//
// Safe to re-run: it overwrites each employee document with the current
// contents of data/employees.json (so if you edited data/employees.json by
// hand, re-running this pushes those edits to Firestore). It will NOT touch
// any fields you've since changed via the /edit.html page and does not delete
// documents for emp_ids no longer present in the file.

const fs = require('fs');
const path = require('path');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See the usage comment at the top of this script.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const projectId = requireEnv('FIREBASE_PROJECT_ID');
  const clientEmail = requireEnv('FIREBASE_CLIENT_EMAIL');
  const privateKeyRaw = requireEnv('FIREBASE_PRIVATE_KEY');
  let privateKey = privateKeyRaw.trim();
  if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
    privateKey = privateKey.slice(1, -1).trim();
  }
  if (privateKey.indexOf('\\n') !== -1) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    console.error('FIREBASE_PRIVATE_KEY 格式不正確（找不到 "BEGIN PRIVATE KEY" 標頭），請確認是完整複製服務帳戶 JSON 檔的 private_key 欄位值。');
    process.exit(1);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('firebase-admin is not installed. Run `npm install` in this project directory first.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  const db = admin.firestore();

  const employeesPath = path.join(__dirname, '..', 'data', 'employees.json');
  const employees = JSON.parse(fs.readFileSync(employeesPath, 'utf8'));
  console.log(`Loaded ${employees.length} employee records from data/employees.json`);

  let batch = db.batch();
  let opsInBatch = 0;
  let total = 0;

  for (const emp of employees) {
    if (!emp.emp_id) continue;
    const ref = db.collection('employees').doc(emp.emp_id);
    batch.set(ref, emp, { merge: false });
    opsInBatch += 1;
    total += 1;

    // Firestore batches are capped at 500 writes.
    if (opsInBatch >= 400) {
      await batch.commit();
      console.log(`Committed ${total} so far...`);
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  console.log(`Done. Wrote ${total} employee documents to Firestore collection "employees".`);
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
