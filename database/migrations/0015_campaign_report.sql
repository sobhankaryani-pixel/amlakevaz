-- Run once before publishing Stage 6; no records or media are changed.
CREATE INDEX IF NOT EXISTS site_events_session_time
ON app.site_events(session_id,created_at,id) WHERE session_id IS NOT NULL;
