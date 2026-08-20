const { requireEditor } = require('../lib/auth');
const { createEmployee } = require('../lib/firestore');

// Adds a person who is not in the original registration export - a late sign-up,
// or someone the 福委 missed. Editor-only.
//
// Unlike the edit endpoint, identity fields (emp_id, name, batch) ARE accepted
// here, because this is where the record comes into existence. Everything else
// is optional and can be filled in afterwards through the normal edit form.
const OPTIONAL_FIELDS = [
  'division', 'department', 'region', 'emp_type', 'meal',
  'outbound_station', 'return_station', 'afternoon_activity', 'evening_activity',
  'morning_bus', 'activity_bus', 'table', 'hsr_outbound', 'hsr_return',
];

function cleanId(v) {
  return String(v || '').trim().toUpperCase();
}

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

  const empId = cleanId(body && body.emp_id);
  const name = String((body && body.name) || '').trim();

  if (!empId) {
    res.status(400).json({ error: '請輸入員工編號' });
    return;
  }
  if (!/^[A-Z0-9]{4,20}$/.test(empId)) {
    res.status(400).json({ error: '員工編號格式不正確，請使用英數字（例如 Z00012345）' });
    return;
  }
  if (!name) {
    res.status(400).json({ error: '請輸入姓名' });
    return;
  }

  const fam = (body && body.family_summary) || {};
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const familySummary = {
    adult: num(fam.adult), c6_12: num(fam.c6_12),
    c3_6: num(fam.c3_6), under3: num(fam.under3),
  };

  const record = {
    emp_id: empId,
    name: name,
    batch: String((body && body.batch) || '第二梯').trim(),
    bring_family: !!(body && body.bring_family),
    family_summary: familySummary,
    dependents: [],
  };
  for (const key of OPTIONAL_FIELDS) {
    const v = body ? body[key] : undefined;
    record[key] = v === undefined || v === '' ? null : v;
  }

  try {
    const created = await createEmployee(record);
    if (!created) {
      res.status(409).json({ error: '員工編號 ' + empId + ' 已存在，請改用「搜尋員工資料」編輯既有資料。' });
      return;
    }
    res.status(201).json({ employee: created });
  } catch (err) {
    res.status(500).json({ error: '新增時發生問題（' + (err && err.message) + '）' });
  }
};
