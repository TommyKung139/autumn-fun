# One-off script that generates the `combined_layout` key in ../data/reference.json —
# the single merged "餐檯＋座位" floor-plan diagram shown on info.html.
#
# It rescales each table zone's (A/B/C, from Excel's own "分桌座位圖請參考" sheet)
# internal relative layout into target regions hand-picked to match 島語洲際店's own
# published floor-plan photo (food stations top/center-right, 板前 top-left, A-zone
# as one big block on the right, C-zone bottom-left, B-zone bottom-center, entrance
# bottom). The target_boxes below were eyeballed against that photo - if the venue's
# floor plan or a clearer photo becomes available, re-tune target_boxes and re-run.
#
# Requires ../data/reference.json to already contain a `table_layout` key
# (see build_table_layout.py) before running this.
import json, os

ref_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'reference.json')
ref = json.load(open(ref_path, encoding='utf-8'))
tables = ref['table_layout']['tables']


def zone_of(code):
    c = code.strip()
    if c == '板前':
        return 'front'
    if c[0] in ('A', 'B', 'C'):
        return c[0]
    return None


# Bounding boxes as originally computed from the Excel sheet's own row/col (see
# build_table_layout.py's grid_row/grid_col). Recompute if table_layout changes.
src_boxes = {
    'A': {'min_r': 6, 'max_r': 50, 'min_c': 11, 'max_c': 27},
    'B': {'min_r': 36, 'max_r': 59, 'min_c': 1, 'max_c': 9},
    'C': {'min_r': 4, 'max_r': 30, 'min_c': 1, 'max_c': 9},
}

# Target regions in the new unified 64x52 grid, matching 島語洲際店's real floor-plan photo.
target_boxes = {
    'A': {'min_r': 1, 'max_r': 40, 'min_c': 54, 'max_c': 64},
    'B': {'min_r': 40, 'max_r': 52, 'min_c': 20, 'max_c': 36},
    'C': {'min_r': 34, 'max_r': 52, 'min_c': 7, 'max_c': 20},
}


def rescale(val, smin, smax, tmin, tmax):
    if smax == smin:
        return tmin
    frac = (val - smin) / (smax - smin)
    return tmin + frac * (tmax - tmin)


items = []
for t in tables:
    z = zone_of(t['code'])
    if z == 'front':
        items.append({
            'type': 'table', 'code': t['code'], 'dept_raw': t['dept_raw'], 'count': t['count'],
            'col': 15, 'row': 1, 'col_span': 8, 'row_span': 7,
        })
        continue
    if z not in src_boxes:
        continue
    sb, tb = src_boxes[z], target_boxes[z]
    r0, r1 = t['grid_row'], t['grid_row'] + t['row_span'] - 1
    c0, c1 = t['grid_col'], t['grid_col'] + t['col_span'] - 1
    nr0 = rescale(r0, sb['min_r'], sb['max_r'] + 1, tb['min_r'], tb['max_r'] + 1)
    nr1 = rescale(r1 + 1, sb['min_r'], sb['max_r'] + 1, tb['min_r'], tb['max_r'] + 1)
    nc0 = rescale(c0, sb['min_c'], sb['max_c'] + 1, tb['min_c'], tb['max_c'] + 1)
    nc1 = rescale(c1 + 1, sb['min_c'], sb['max_c'] + 1, tb['min_c'], tb['max_c'] + 1)
    items.append({
        'type': 'table', 'code': t['code'], 'dept_raw': t['dept_raw'], 'count': t['count'],
        'col': max(1, round(nc0)), 'row': max(1, round(nr0)),
        'col_span': max(1, round(nc1 - nc0)), 'row_span': max(1, round(nr1 - nr0)),
    })

# Food stations & facilities, hand-placed to match the real photo's macro layout.
food = [
    {'code': '極', 'theme': '串揚劇場', 'col': 24, 'row': 1, 'col_span': 6, 'row_span': 9},
    {'code': '燦', 'theme': '酥香炙宴', 'col': 30, 'row': 1, 'col_span': 6, 'row_span': 9},
    {'code': '煲', 'theme': '暖心食補', 'col': 36, 'row': 1, 'col_span': 6, 'row_span': 9},
    {'code': '膳', 'theme': '經典華筵', 'col': 42, 'row': 1, 'col_span': 6, 'row_span': 9},
    {'code': '炙', 'theme': '炭火盛宴', 'col': 48, 'row': 1, 'col_span': 6, 'row_span': 9},
    {'code': '盛', 'theme': '旬味和韻', 'col': 24, 'row': 10, 'col_span': 3, 'row_span': 18},
    {'code': '鮮', 'theme': '大海巡禮', 'col': 28, 'row': 13, 'col_span': 10, 'row_span': 7},
    {'code': '沁', 'theme': '微醺序章', 'col': 28, 'row': 20, 'col_span': 10, 'row_span': 7},
    {'code': '自助飲料', 'theme': '自助飲料', 'col': 6, 'row': 27, 'col_span': 8, 'row_span': 7, 'is_facility': True},
    {'code': '續', 'theme': '甜點樂章', 'col': 1, 'row': 40, 'col_span': 5, 'row_span': 9},
]
for f in food:
    items.append({'type': 'food', **f})

for f in [
    {'code': '服務台', 'col': 58, 'row': 20, 'col_span': 6, 'row_span': 7},
    {'code': '柱', 'col': 44, 'row': 27, 'col_span': 5, 'row_span': 6},
]:
    items.append({'type': 'facility', **f})

ref['combined_layout'] = {
    'grid_rows': 52,
    'grid_cols': 64,
    'items': items,
    'entrance': {'col': 37, 'row': 49, 'col_span': 6, 'row_span': 4, 'label': '大門 入口'},
}
json.dump(ref, open(ref_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('combined_layout written, items:', len(items))
