const { requireAuth } = require('../lib/auth');
const employees = require('../data/employees.json');

// Minimal, non-sensitive fields for the "who's going" directory.
const roster = employees.map((e) => ({
  emp_id: e.emp_id,
  name: e.name,
  division: e.division,
  department: e.department,
  region: e.region,
  bring_family: e.bring_family,
  family_count:
    (Number(e.family_summary.adult) || 0) +
    (Number(e.family_summary.c6_12) || 0) +
    (Number(e.family_summary.c3_6) || 0) +
    (Number(e.family_summary.under3) || 0),
  afternoon_activity: e.afternoon_activity,
  evening_activity: e.evening_activity,
  table: e.table,
}));

module.exports = (req, res) => {
  if (!requireAuth(req, res)) return;
  res.status(200).json({ count: roster.length, roster });
};
