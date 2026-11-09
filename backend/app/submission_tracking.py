"""Persisted numeric receipts. UUIDs remain internal authorization identifiers."""
def ensure_tracking(conn):
    if conn.execute("SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='property_submissions' AND column_name='tracking_code'").fetchone():
        return
    conn.execute("SELECT pg_advisory_xact_lock(610290451)")
    conn.execute("CREATE SEQUENCE IF NOT EXISTS app.submission_tracking_seq MINVALUE 100000 MAXVALUE 999999 NO CYCLE")
    conn.execute("ALTER TABLE app.property_submissions ADD COLUMN IF NOT EXISTS tracking_code integer")
    conn.execute("UPDATE app.property_submissions SET tracking_code=nextval('app.submission_tracking_seq') WHERE tracking_code IS NULL")
    conn.execute("ALTER TABLE app.property_submissions ALTER COLUMN tracking_code SET DEFAULT nextval('app.submission_tracking_seq'), ALTER COLUMN tracking_code SET NOT NULL")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS submission_tracking_unique ON app.property_submissions(tracking_code)")
