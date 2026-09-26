-- Monthly expert estimates are stored separately from verified sale prices.
INSERT INTO app.property_types(code,name,category) VALUES
 ('apartment','آپارتمان','مسکونی') ON CONFLICT(code) DO NOTHING;
CREATE TABLE IF NOT EXISTS app.monthly_price_estimates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 period text NOT NULL CHECK (period ~ '^[0-9]{4}/(0[1-9]|1[0-2])$'),
 segment text NOT NULL CHECK (segment IN ('land_residential','land_commercial','house_new','apartment','mehr')),
 region_key text NOT NULL DEFAULT 'all',
 value_toman bigint NOT NULL CHECK (value_toman > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(period,segment,region_key),
 CHECK (segment NOT LIKE 'land_%' OR region_key <> 'all')
);
CREATE INDEX IF NOT EXISTS property_sales_sale_month_idx ON app.property_sales (sale_date);
