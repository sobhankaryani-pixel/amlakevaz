-- Apply after 0009. Account and message data remain private to the backend.
CREATE TABLE IF NOT EXISTS app.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('signup','manual','legacy_request')),
  account_enabled boolean NOT NULL DEFAULT false,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  consent_source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS customer_contacts_created_idx ON app.customer_contacts(created_at DESC);

CREATE TABLE IF NOT EXISTS app.seller_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  ip_hash text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_otp_phone_created_idx ON app.seller_otp_codes(phone,created_at DESC);
CREATE INDEX IF NOT EXISTS seller_otp_ip_created_idx ON app.seller_otp_codes(ip_hash,created_at DESC);

CREATE TABLE IF NOT EXISTS app.seller_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES app.customer_contacts(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seller_sessions_contact_idx ON app.seller_sessions(contact_id);

ALTER TABLE app.property_submissions ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES app.customer_contacts(id);
CREATE INDEX IF NOT EXISTS property_submissions_seller_created_idx ON app.property_submissions(seller_id,created_at DESC);

CREATE TABLE IF NOT EXISTS app.sms_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES app.users(id)
);
CREATE TABLE IF NOT EXISTS app.sms_campaign_recipients (
  campaign_id uuid NOT NULL REFERENCES app.sms_campaigns(id),
  contact_id uuid NOT NULL REFERENCES app.customer_contacts(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','skipped')),
  provider_reference text,
  error_message text,
  sent_at timestamptz,
  PRIMARY KEY (campaign_id,contact_id)
);
CREATE INDEX IF NOT EXISTS sms_campaign_recipients_status_idx ON app.sms_campaign_recipients(campaign_id,status);

-- Preserve historical unverified requests as contacts; no marketing permission is inferred.
INSERT INTO app.customer_contacts(phone,name,source)
SELECT seller_phone,max(seller_name),'legacy_request' FROM app.property_submissions
WHERE seller_phone ~ '^09[0-9]{9}$' GROUP BY seller_phone
ON CONFLICT (phone) DO NOTHING;
UPDATE app.property_submissions s SET seller_id=c.id FROM app.customer_contacts c
WHERE s.seller_id IS NULL AND s.seller_phone=c.phone;

REVOKE ALL ON app.customer_contacts,app.seller_otp_codes,app.seller_sessions,
 app.sms_campaigns,app.sms_campaign_recipients FROM PUBLIC, anon, authenticated;
