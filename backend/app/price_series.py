from collections import defaultdict
from statistics import median

SEGMENTS = ('land_residential', 'land_commercial', 'house_new', 'apartment', 'mehr', 'mehr_upper', 'mehr_lower')

def sale_segment(code, usage, condition, mehr_level=None):
    if code in ('raw_land', 'land', 'commercial_land'):
        return 'land_commercial' if code == 'commercial_land' or usage == 'تجاری' else 'land_residential'
    if code in ('villa_house', 'villa') and condition == 'نوساز':
        return 'house_new'
    if code == 'apartment':
        return 'apartment'
    if code == 'mehr_housing':
        return {'بالا': 'mehr_upper', 'پایین': 'mehr_lower'}.get(mehr_level, 'mehr')
    return None

def sale_series(rows, region_key='all'):
    groups = defaultdict(list)
    for row in rows:
        segment = sale_segment(row['code'], row['usage_type'], row['house_condition'], row.get('mehr_level'))
        if not segment or region_key != 'all' and row['region_key'] != region_key:
            continue
        sale_date = str(row['sale_date'] or '')
        if len(sale_date) != 10 or sale_date[4] != '/' or sale_date[7] != '/' or not sale_date[:4].isdigit() or not sale_date[5:7].isdigit() or not sale_date[8:].isdigit() or not 1 <= int(sale_date[5:7]) <= 12 or not 1 <= int(sale_date[8:]) <= 31:
            continue
        area = row['area_m2'] if segment.startswith('land_') else row['building_area_m2']
        if not segment.startswith('mehr') and (area is None or area <= 0):
            continue
        value = int(row['sale_price_toman']) if segment.startswith('mehr') else float(row['sale_price_toman']) / float(area)
        groups[segment, sale_date[:7]].append(value)
    result = defaultdict(list)
    for (segment, period), values in sorted(groups.items()):
        result[segment].append({'period': period, 'value_toman': round(median(values)), 'count': len(values)})
    return dict(result)
