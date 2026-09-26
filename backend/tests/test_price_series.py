import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.price_series import sale_series


class PriceSeriesTests(unittest.TestCase):
    def test_sales_use_final_price_and_the_correct_area_and_region(self):
        base = dict(usage_type=None, house_condition=None, area_m2=None,
                    building_area_m2=None, region_key='R-01')
        rows = [
            dict(base, code='raw_land', area_m2=100, sale_date='1405/07/03', sale_price_toman=1_000_000_000),
            dict(base, code='commercial_land', area_m2=100, sale_date='1405/07/04', sale_price_toman=2_000_000_000),
            dict(base, code='villa_house', house_condition='نوساز', building_area_m2=50, sale_date='1405/07/05', sale_price_toman=3_000_000_000),
            dict(base, code='villa_house', house_condition='کلنگی', building_area_m2=50, sale_date='1405/07/05', sale_price_toman=5_000_000_000),
            dict(base, code='mehr_housing', mehr_level='بالا', sale_date='1405/07/06', sale_price_toman=1_500_000_000),
            dict(base, code='mehr_housing', mehr_level='پایین', sale_date='1405/07/06', sale_price_toman=1_700_000_000),
            dict(base, code='raw_land', area_m2=100, region_key='R-02', sale_date='1405/07/06', sale_price_toman=4_000_000_000),
        ]
        series = sale_series(rows, 'R-01')
        self.assertEqual(series['land_residential'][0]['value_toman'], 10_000_000)
        self.assertEqual(series['land_commercial'][0]['value_toman'], 20_000_000)
        self.assertEqual(series['house_new'][0]['value_toman'], 60_000_000)
        self.assertEqual(series['mehr_upper'][0]['value_toman'], 1_500_000_000)
        self.assertEqual(series['mehr_lower'][0]['value_toman'], 1_700_000_000)
        self.assertEqual(series['land_residential'][0]['count'], 1)

    def test_median_and_invalid_area(self):
        base = dict(code='apartment', usage_type=None, house_condition=None,
                    area_m2=None, building_area_m2=100, region_key='R-01', sale_date='1405/07/12')
        rows = [dict(base, sale_price_toman=n * 100) for n in (10_000_000, 12_000_000, 100_000_000)]
        rows.append(dict(base, building_area_m2=None, sale_price_toman=800_000_000))
        self.assertEqual(sale_series(rows)['apartment'][0],
                         {'period': '1405/07', 'value_toman': 12_000_000, 'count': 3})

    def test_older_mehr_sales_without_level_stay_unclassified(self):
        rows = [dict(code='mehr_housing', mehr_level=None, usage_type=None,
                     house_condition=None, area_m2=None, building_area_m2=None,
                     region_key='R-01', sale_date='1405/07/06', sale_price_toman=1_000_000_000)]
        self.assertEqual(sale_series(rows)['mehr'][0]['value_toman'], 1_000_000_000)


if __name__ == '__main__':
    unittest.main()
