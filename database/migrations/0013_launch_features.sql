BEGIN;
ALTER TABLE app.properties ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE app.properties ADD COLUMN IF NOT EXISTS updated_at timestamptz;
-- Historical dates stay unknown rather than inventing a last-edit date.
CREATE OR REPLACE FUNCTION app.touch_property_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS property_updated_at ON app.properties;
CREATE TRIGGER property_updated_at BEFORE INSERT OR UPDATE ON app.properties FOR EACH ROW EXECUTE FUNCTION app.touch_property_updated_at();
CREATE TABLE IF NOT EXISTS app.uploaded_media (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL, owner_role text NOT NULL,
 filename text UNIQUE NOT NULL, kind text NOT NULL CHECK(kind IN ('image','video')),
 size_bytes bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.contact_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,phone text NOT NULL,
 description text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.site_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,event text NOT NULL,session_id uuid,
 path text NOT NULL DEFAULT '/',property_code text,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS site_events_time ON app.site_events(created_at DESC);
CREATE INDEX IF NOT EXISTS site_events_property ON app.site_events(property_code,event);
CREATE TABLE IF NOT EXISTS app.request_limits (
 key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS app.site_errors (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,kind text NOT NULL,path text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.backup_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),
 filename text NOT NULL,size_bytes bigint NOT NULL,sha256 text NOT NULL,status text NOT NULL DEFAULT 'completed'
);
COMMIT;
