-- Run once after 0001 and 0002. Existing imported records remain intact.
ALTER TABLE app.properties
 ADD COLUMN IF NOT EXISTS registration_month text,
 ADD COLUMN IF NOT EXISTS bedrooms integer,
 ADD COLUMN IF NOT EXISTS street_frontage_m numeric(8,2),
 ADD COLUMN IF NOT EXISTS mehr_block text,
 ADD COLUMN IF NOT EXISTS mehr_unit text,
 ADD COLUMN IF NOT EXISTS national_phase text,
 ADD COLUMN IF NOT EXISTS national_stage text,
 ADD COLUMN IF NOT EXISTS national_notes text;
CREATE TABLE IF NOT EXISTS app.property_sales (
 property_id uuid PRIMARY KEY REFERENCES app.properties(id),
 sale_date text NOT NULL,
 sale_price_toman bigint NOT NULL CHECK(sale_price_toman>0),
 notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.manual_price_ranges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 region_id uuid NOT NULL REFERENCES app.regions(id),
 property_type_id uuid NOT NULL REFERENCES app.property_types(id),
 period text NOT NULL,
 low_price_toman bigint NOT NULL CHECK(low_price_toman>0),
 high_price_toman bigint NOT NULL CHECK(high_price_toman>=low_price_toman),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(region_id,property_type_id,period)
);
INSERT INTO app.regions(name,slug) VALUES
 ('مرکز شهر','R-01'),('ابتدای بردسپی','R-02'),('اواسط بردسپی','R-03'),('اواخر بردسپی','R-04'),
 ('شهرک فردوس','R-05'),('پشت سیتی سنتر','R-06'),('پشت آبفا','R-07'),('باستانه','R-08'),
 ('شهرک فرصتی','R-09'),('پشت ترمینال','R-10'),('پشت نون قلم','R-11'),('پشت ایران خودرو','R-12'),
 ('کنارسبز محدوده پارک بیتا','R-13'),('کنارسبز محدود آتش نشانی','R-14'),
 ('محدوده مسجد میرزایی','R-15'),('محله کامیاب','R-16') ON CONFLICT(slug) DO NOTHING;
INSERT INTO app.property_types(code,name,category) VALUES
 ('raw_land','زمین خام','زمین'),('commercial_land','زمین تجاری','زمین'),
 ('villa_house','خانه ویلایی','مسکونی'),('shop','مغازه','تجاری'),
 ('mehr_housing','مسکن مهر','مسکونی'),('national_housing','مسکن ملی','مسکونی'),
 ('urban_garden','باغ شهری','زمین') ON CONFLICT(code) DO NOTHING;
