BEGIN;
ALTER TABLE app.uploaded_media ADD COLUMN IF NOT EXISTS retain_until timestamptz NOT NULL DEFAULT (now()+interval '30 days');
ALTER TABLE app.uploaded_media ADD COLUMN IF NOT EXISTS cleanup_state text NOT NULL DEFAULT 'active' CHECK(cleanup_state IN ('active','deleting','deleted'));
ALTER TABLE app.uploaded_media ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS uploaded_media_cleanup_due ON app.uploaded_media(retain_until) WHERE cleanup_state<>'deleted';

-- Media attachments lock the same registry rows as cleanup. An attachment that
-- races deletion must either commit before the reference recheck or be rejected.
CREATE OR REPLACE FUNCTION app.guard_media_cleanup_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
 FOR item IN SELECT id,cleanup_state FROM app.uploaded_media
  WHERE strpos(to_jsonb(NEW)::text,filename)>0 ORDER BY id FOR SHARE
 LOOP
  IF item.cleanup_state<>'active' THEN
   RAISE EXCEPTION 'Media is unavailable; upload it again'
    USING ERRCODE='23514',CONSTRAINT='media_cleanup_reference_guard';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_property_media_cleanup ON app.properties;
CREATE TRIGGER protect_property_media_cleanup BEFORE INSERT OR UPDATE ON app.properties
 FOR EACH ROW EXECUTE FUNCTION app.guard_media_cleanup_references();
DROP TRIGGER IF EXISTS protect_submission_media_cleanup ON app.property_submissions;
CREATE TRIGGER protect_submission_media_cleanup BEFORE INSERT OR UPDATE ON app.property_submissions
 FOR EACH ROW EXECUTE FUNCTION app.guard_media_cleanup_references();
DROP TRIGGER IF EXISTS protect_promotion_media_cleanup ON app.homepage_promotions;
CREATE TRIGGER protect_promotion_media_cleanup BEFORE INSERT OR UPDATE ON app.homepage_promotions
 FOR EACH ROW EXECUTE FUNCTION app.guard_media_cleanup_references();
COMMIT;
