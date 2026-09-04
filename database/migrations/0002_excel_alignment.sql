-- Excel alignment migration
-- Adds fields and tables required by the official DS-EVAZ workbook
ALTER TABLE app.properties
 ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES app.regions(id),
 ADD COLUMN IF NOT EXISTS neighborhood_id uuid REFERENCES app.neighborhoods(id),
 ADD COLUMN IF NOT EXISTS general_area text,
 ADD COLUMN IF NOT EXISTS commercial_area_m2 numeric(12,2),
 ADD COLUMN IF NOT EXISTS building_age integer,
 ADD COLUMN IF NOT EXISTS floor_count integer,
 ADD COLUMN IF NOT EXISTS street_width numeric(8,2),
 ADD COLUMN IF NOT EXISTS usage_type text,
 ADD COLUMN IF NOT EXISTS building_quality text,
 ADD COLUMN IF NOT EXISTS building_condition text,
 ADD COLUMN IF NOT EXISTS features text,
 ADD COLUMN IF NOT EXISTS public_notes text,
 ADD COLUMN IF NOT EXISTS private_notes text;

CREATE TABLE IF NOT EXISTS app.national_housing_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES app.properties(id), phase text NOT NULL, progress_stage text, low_price_toman bigint, high_price_toman bigint, paid_toman bigint, remaining_commitment_toman bigint, transfer_price_toman bigint, progress_percent numeric(5,2), delivery_status text, features text, notes text, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS app.mehr_housing_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), property_id uuid REFERENCES app.properties(id), floor text, low_price_toman bigint, high_price_toman bigint, renovation_status text, block text, delivery_status text, features text, notes text, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS app.special_opportunities_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, month text, listing_code text, property_id uuid REFERENCES app.properties(id), title text, price_toman bigint, comparison_percent numeric(8,4), reason text, advantages text, limitations text, image_path text, publish_date date, end_date date, contact_text text, status text, created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS app.region_ranking_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text, region_id uuid REFERENCES app.regions(id), rank integer, label text, notes text, created_at timestamptz NOT NULL DEFAULT now());
