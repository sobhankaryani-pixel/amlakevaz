-- Seller requests are private and never appear in public listing or price queries.
CREATE TABLE IF NOT EXISTS app.property_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  seller_name text NOT NULL,
  seller_phone text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('land','villa','apartment','mehr','national')),
  details jsonb NOT NULL,
  approved_property_code text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES app.users(id)
);
CREATE INDEX IF NOT EXISTS property_submissions_status_created_idx ON app.property_submissions(status,created_at DESC);
REVOKE ALL ON app.property_submissions FROM PUBLIC, anon, authenticated;

-- National housing: block is separate from Mehr housing and level may be unknown.
ALTER TABLE app.properties ADD COLUMN IF NOT EXISTS national_block text;
ALTER TABLE app.properties ADD COLUMN IF NOT EXISTS national_level text;
ALTER TABLE app.properties DROP CONSTRAINT IF EXISTS properties_national_level_check;
ALTER TABLE app.properties ADD CONSTRAINT properties_national_level_check CHECK (national_level IS NULL OR national_level IN ('بالا','پایین','نامشخص'));
