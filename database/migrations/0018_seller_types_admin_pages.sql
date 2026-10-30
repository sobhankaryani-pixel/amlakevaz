BEGIN;
ALTER TABLE app.property_submissions DROP CONSTRAINT IF EXISTS property_submissions_kind_check;
ALTER TABLE app.property_submissions ADD CONSTRAINT property_submissions_kind_check
 CHECK(kind IN ('land','villa','apartment','mehr','national','shop','garden'));
INSERT INTO app.property_types(code,name,category) VALUES
 ('shop','مغازه','تجاری'),('urban_garden','باغ شهری','زمین') ON CONFLICT(code) DO NOTHING;
CREATE INDEX IF NOT EXISTS properties_admin_created_idx ON app.properties(created_at DESC,id DESC);
COMMIT;
