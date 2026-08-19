const { requireEditor } = require('../lib/auth');
const { getEmployee, updateEmployee } = require('../lib/firestore');

// Fields a 梯長／福委 is allowed to adjust from the edit page. Identity fields
// (emp_id, name, batch) and dependents (which have their own source-of-truth rows
// in the registration sheet) are intentionally not editable here in v1.
const EDITABLE_FIELDS = [
  'division', 'department', 'region', 'emp_type', 'meal',
  'outbound_station', 'return_station', 'afternoon_activity', 'evening_activity',
  'bring_family', 'family_summary',
  'morning_bus', 'activity_bus', 'table',
  'hsr_outbound', 'hsr_return',
];

module.exports = async (req, res) => {
  if (!requireEditor(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const empId = String((body && body.emp_id) || '').trim().toUpperCase();
  const patchIn = (body && body.patch) || {};
  if (!empId) {
    res.status(400).json({ error: '缺少員工編號' });
    return;
  }

  const patch = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patchIn, key)) {
      patch[key] = patchIn[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: '沒有可更新的欄位' });
    return;
  }

  try {
    const existing = await getEmployee(empId);
    if (!existing) {
      res.status(404).json({ error: '查無此員工編號' });
      return;
    }
    const updated = await updateEmployee(empId, patch);
    res.status(200).json({ employee: updated });
  } catch (err) {
    res.status(500).json({ error: '更新時發生問題（' + (err && err.message) + '）' });
  }
};
