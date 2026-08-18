# One-off data-extraction script used to generate ../data/employees.json from the
# original "2026秋郊報名表_第二梯_數平經策作資0818.xlsx" registration workbook.
# Not run at deploy time / not needed for the website to work - kept only for
# provenance and so the data can be regenerated if the Excel is updated.
# Requires: pip install openpyxl
# Also requires scripts/hsr_raw.json (generated separately from the HSR seating
# sheets - see project notes) to be present in this folder before running.
import openpyxl, re, json, sys, os

SRC = os.environ.get('SRC_XLSX', './2026秋郊報名表_第二梯_數平經策作資0818.xlsx')
wb = openpyxl.load_workbook(SRC, data_only=True)

# ---------- 1. Employees ----------
ws = wb['(彙整)報名表(員工)']
employees = {}
for row in ws.iter_rows(min_row=3, values_only=True):
    batch, seq, division, dept, region, emp_id, name, emp_type, attend = row[0:9]
    if not emp_id or not attend or not str(attend).startswith('參加'):
        continue
    meal = row[13]
    outbound_station = row[16]
    return_station = row[17]
    afternoon = row[18]
    evening = row[19]
    bring_family = row[20]
    fam_adult, fam_6_12, fam_3_6, fam_under3 = row[21], row[22], row[23], row[24]
    employees[emp_id] = {
        'emp_id': emp_id, 'name': name, 'division': division, 'department': dept,
        'region': region, 'emp_type': emp_type, 'batch': batch, 'meal': meal,
        'outbound_station': outbound_station, 'return_station': return_station,
        'afternoon_activity': afternoon, 'evening_activity': evening,
        'bring_family': (bring_family == '是'),
        'family_summary': {'adult': fam_adult or 0, 'c6_12': fam_6_12 or 0, 'c3_6': fam_3_6 or 0, 'under3': fam_under3 or 0},
        'morning_bus': None, 'activity_bus': None, 'table': None,
        'hsr_outbound': None, 'hsr_return': None, 'dependents': []
    }

name_index = {}
for eid, e in employees.items():
    name_index.setdefault(e['name'], []).append(eid)

def strip_name(raw):
    if not raw: return raw, None
    raw = raw.strip()
    m = re.match(r'^(.*?)[（(]([^)）]*)[)）]\s*$', raw)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return raw, None

def match_emp_id(raw_name):
    base, tag = strip_name(raw_name)
    if tag in ('眷屬',) or (tag and '眷屬' in tag):
        return None
    candidates = name_index.get(base)
    if not candidates:
        return None
    return candidates[0]

# ---------- 2. Dependents ----------
ws2 = wb['(彙整)報名表(眷屬)']
for row in ws2.iter_rows(min_row=4, values_only=True):
    emp_name, emp_id = row[4], row[5]
    dep_name, relation = row[6], row[7]
    age_band = row[17]
    hsr_out, hsr_back = row[18], row[19]
    afternoon, evening = row[20], row[21]
    if not emp_id or emp_id not in employees:
        continue
    employees[emp_id]['dependents'].append({
        'name': dep_name, 'relation': relation, 'age_band': age_band,
        'outbound_station': hsr_out, 'return_station': hsr_back,
        'afternoon_activity': afternoon, 'evening_activity': evening,
    })

# ---------- 3. Bus table 1 (morning, rows 5-46) & table 2 (afternoon, rows 50-90) ----------
ws3 = wb['分車表 (2)']

def parse_bus_table(header_row, row_start, row_end, field):
    car_cols = {}
    for c in range(2, ws3.max_column+1):
        v = ws3.cell(row=header_row, column=c).value
        if v and isinstance(v, str) and '車' in v:
            car_cols[c] = v.split('\n')[0] + '｜' + '/'.join(v.split('\n')[1:])
    m, u = 0, 0
    for r in range(row_start, row_end+1):
        for c, label in car_cols.items():
            v = ws3.cell(row=r, column=c).value
            if not v or not isinstance(v, str) or v.strip() in ('', '　'):
                continue
            eid = match_emp_id(v)
            if eid:
                employees[eid][field] = label
                m += 1
            else:
                u += 1
    return m, u

print('morning bus', parse_bus_table(4, 5, 46, 'morning_bus'))
print('activity bus', parse_bus_table(48, 50, 90, 'activity_bus'))

# ---------- 4. Table assignment 分桌表 ----------
ws4 = wb['分桌表']
tm, tu = 0, 0
for row in ws4.iter_rows(min_row=4, values_only=True):
    table_no = row[0]
    if not table_no:
        continue
    for nm in row[3:11]:
        if not nm or not isinstance(nm, str):
            continue
        eid = match_emp_id(nm)
        if eid:
            employees[eid]['table'] = table_no
            tm += 1
        else:
            tu += 1
print('table', tm, tu)

# ---------- 5. HSR named seats ----------
hsr_raw = json.load(open(os.path.join(os.path.dirname(__file__), 'hsr_raw.json')))
def attach_hsr(records, field):
    m, u = 0, 0
    for rec in records:
        eid = match_emp_id(rec['name_raw'])
        if eid:
            employees[eid][field] = {
                'train_no': rec['train_no'], 'car': rec['car'], 'seat_letter': rec['seat_letter'],
                'row_idx': rec['row_idx'], 'station': rec['station'], 'note': rec['note']
            }
            m += 1
        else:
            u += 1
    return m, u
print('hsr_outbound', attach_hsr(hsr_raw['go'], 'hsr_outbound'))
print('hsr_return', attach_hsr(hsr_raw['back'], 'hsr_return'))

out = list(employees.values())
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'data', 'employees.json'), 'w'), ensure_ascii=False, indent=1, default=str)
print('TOTAL EMPLOYEES', len(out))
