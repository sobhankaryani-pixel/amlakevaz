"""Anonymous campaign context; successful conversions are written in the form transaction."""
import re
from uuid import UUID
from psycopg.types.json import Jsonb

def clean_attribution(value):
    if not isinstance(value, dict):
        return {}
    result = {}
    for key in ('source', 'medium', 'campaign', 'referrer'):
        text = value.get(key)
        if not isinstance(text, str):
            continue
        text = text.strip()[:120]
        # Accept labels, never URLs with query strings or arbitrary form fields.
        pattern = r'[a-zA-Z0-9.-]{1,120}' if key == 'referrer' else r'[\w .\-]{1,120}'
        if text and re.fullmatch(pattern, text):
            result[key] = text
    return result

def conversion_context(value):
    if not isinstance(value, dict):
        return None, {}
    try:
        session = UUID(str(value.get('session_id', '')))
    except (ValueError, TypeError, AttributeError):
        return None, {}
    return session, clean_attribution(value.get('details'))

def record_conversion(conn, event, path, context):
    session, details = conversion_context(context)
    conn.execute('INSERT INTO app.site_events(event,session_id,path,details) VALUES (%s,%s,%s,%s)',
                 (event, session, path, Jsonb(details)))

# One row per anonymous visit. Attribution is fixed by the first event of that
# visit, including when that event precedes the selected reporting window.
CAMPAIGN_REPORT_SQL = """
WITH recent AS (
 SELECT * FROM app.site_events WHERE created_at >= now() - (%s * interval '1 day')
), visits AS (
 SELECT session_id,
 count(*) FILTER (WHERE event='page_view') AS views,
 count(*) FILTER (WHERE event='phone_click') AS phone_clicks,
 count(*) FILTER (WHERE event='whatsapp_click') AS whatsapp_clicks,
 count(*) FILTER (WHERE event='contact_submit') AS contact_submissions,
 count(*) FILTER (WHERE event='property_submit') AS property_submissions
 FROM recent WHERE session_id IS NOT NULL GROUP BY session_id
), attributed AS (
 SELECT v.*,COALESCE(first.details->>'source','') AS source,
 COALESCE(first.details->>'medium','') AS medium,
 COALESCE(first.details->>'campaign','') AS campaign,
 COALESCE(first.details->>'referrer','') AS referrer
 FROM visits v JOIN LATERAL (
  SELECT details FROM app.site_events e WHERE e.session_id=v.session_id ORDER BY created_at,id LIMIT 1
 ) first ON true
), summary AS (
 SELECT source,medium,campaign,referrer,true AS has_session,count(*) AS sessions,sum(views) AS views,
 sum(phone_clicks) AS phone_clicks,sum(whatsapp_clicks) AS whatsapp_clicks,
 sum(contact_submissions) AS contact_submissions,sum(property_submissions) AS property_submissions,
 count(*) FILTER (WHERE contact_submissions+property_submissions>0) AS form_sessions,
 count(*) FILTER (WHERE phone_clicks+whatsapp_clicks+contact_submissions+property_submissions>0) AS action_sessions
 FROM attributed GROUP BY source,medium,campaign,referrer
 UNION ALL
 SELECT '', '', '', '', false, 0, 0,
 count(*) FILTER (WHERE event='phone_click'), count(*) FILTER (WHERE event='whatsapp_click'),
 count(*) FILTER (WHERE event='contact_submit'), count(*) FILTER (WHERE event='property_submit'),0,0
 FROM recent WHERE session_id IS NULL
 HAVING count(*) FILTER (WHERE event IN ('phone_click','whatsapp_click','contact_submit','property_submit'))>0
)
SELECT source,medium,campaign,referrer,has_session,sum(sessions) AS sessions,sum(views) AS views,
sum(phone_clicks) AS phone_clicks,sum(whatsapp_clicks) AS whatsapp_clicks,
sum(phone_clicks)+sum(whatsapp_clicks) AS contacts,
sum(contact_submissions) AS contact_submissions,sum(property_submissions) AS property_submissions,
sum(form_sessions) AS form_sessions,sum(action_sessions) AS action_sessions,
CASE WHEN sum(sessions)>0 THEN round(100.0*sum(form_sessions)/sum(sessions),1) ELSE NULL END AS form_rate
FROM summary GROUP BY source,medium,campaign,referrer,has_session ORDER BY sessions DESC,contact_submissions DESC
"""
