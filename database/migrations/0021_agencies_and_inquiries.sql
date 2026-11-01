BEGIN;
CREATE TABLE IF NOT EXISTS app.agencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,username text NOT NULL UNIQUE,
 phone text NOT NULL,password_hash text NOT NULL,is_active boolean NOT NULL DEFAULT true,
 session_version integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.agency_files (
 id uuid PRIMARY KEY,agency_id uuid NOT NULL REFERENCES app.agencies(id),details jsonb NOT NULL DEFAULT '{}',
 version integer NOT NULL DEFAULT 1,property_id uuid REFERENCES app.properties(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_files_owner ON app.agency_files(agency_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS app.agency_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),file_id uuid NOT NULL REFERENCES app.agency_files(id),
 agency_id uuid NOT NULL REFERENCES app.agencies(id),action text NOT NULL CHECK(action IN ('publish','remove')),
 file_version integer NOT NULL,details jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 base_updated_at timestamptz,review_note text NOT NULL DEFAULT '',reviewed_by uuid REFERENCES app.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_one_pending ON app.agency_requests(file_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS agency_review_queue ON app.agency_requests(status,created_at DESC);
CREATE TABLE IF NOT EXISTS app.property_inquiries (
 id uuid PRIMARY KEY,property_id uuid NOT NULL REFERENCES app.properties(id),property_code text NOT NULL,
 contact_id uuid NOT NULL REFERENCES app.customer_contacts(id),purpose text NOT NULL CHECK(purpose IN ('consultation','visit')),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','followed_up','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inquiry_queue ON app.property_inquiries(status,created_at DESC);
DROP TRIGGER IF EXISTS protect_agency_file_media ON app.agency_files;
CREATE TRIGGER protect_agency_file_media BEFORE INSERT OR UPDATE ON app.agency_files FOR EACH ROW EXECUTE FUNCTION app.guard_media_cleanup_references();
DROP TRIGGER IF EXISTS protect_agency_request_media ON app.agency_requests;
CREATE TRIGGER protect_agency_request_media BEFORE INSERT OR UPDATE ON app.agency_requests FOR EACH ROW EXECUTE FUNCTION app.guard_media_cleanup_references();
REVOKE ALL ON app.agencies,app.agency_files,app.agency_requests,app.property_inquiries FROM PUBLIC,anon,authenticated;
COMMIT;
