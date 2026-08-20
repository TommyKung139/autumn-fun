const { requireAuth } = require('../lib/auth');
const { listEmployees, hasFirebaseConfig } = require('../lib/firestore');
const { buildCharts } = require('../lib/charts');

// Serves the 高鐵座位表 / 分車表 / 分桌表, built from the live employee records so
// that seat changes made in the editor (or directly in Firestore) show up here.
//
// Building these needs a read of the whole collection, which on Firestore is one
// document read per employee. To keep that off the per-request path - and well
// inside the free quota when the whole 梯次 opens the page at once - the result is
// cached in the function instance for CHARTS_CACHE_SECONDS (default 5 minutes).
// Lower it if edits need to appear faster; raise it to spend fewer reads.
const CACHE_MS = (Number(process.env.CHARTS_CACHE_SECONDS) || 300) * 1000;

let cache = null; // { at: epochMs, payload }

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const fresh = req.query && (req.query.fresh === '1' || req.query.fresh === 'true');
  const now = Date.now();
  if (!fresh && cache && now - cache.at < CACHE_MS) {
    res.status(200).json(Object.assign({}, cache.payload, { cached: true }));
    return;
  }

  try {
    const employees = await listEmployees();
    const payload = Object.assign(buildCharts(employees), {
      source: hasFirebaseConfig() ? 'firestore' : 'local',
      generated_at: new Date().toISOString(),
      cache_seconds: Math.round(CACHE_MS / 1000),
    });
    cache = { at: now, payload };
    res.status(200).json(Object.assign({}, payload, { cached: false }));
  } catch (err) {
    res.status(500).json({ error: '讀取編排資料時發生問題（' + (err && err.message) + '）' });
  }
};
