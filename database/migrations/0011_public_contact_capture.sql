-- Public visitor sign-up and channel-specific marketing consent.
-- Apply after 0010_seller_accounts_crm_sms.sql.

ALTER TABLE app.customer_contacts
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_consent_source text;

-- Keep public website subscriptions distinct from authenticated seller accounts.
ALTER TABLE app.customer_contacts DROP CONSTRAINT IF EXISTS customer_contacts_source_check;
ALTER TABLE app.customer_contacts
  ADD CONSTRAINT customer_contacts_source_check
  CHECK (source IN ('signup','manual','legacy_request','website_form'));

CREATE INDEX IF NOT EXISTS customer_contacts_whatsapp_opt_in_idx
  ON app.customer_contacts(created_at DESC)
  WHERE whatsapp_opt_in = true AND is_active = true;
CREATE INDEX IF NOT EXISTS customer_contacts_sms_opt_in_idx
  ON app.customer_contacts(created_at DESC)
  WHERE marketing_opt_in = true AND is_active = true;

REVOKE ALL ON app.customer_contacts FROM PUBLIC, anon, authenticated;
