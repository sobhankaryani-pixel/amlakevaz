"""Successful form attribution, sanitization and anonymous compatibility."""
from uuid import uuid4
from unittest.mock import MagicMock
from backend.tests.test_launch import env, USER, admin
from backend.app import main, launch
from backend.app.seller_auth import require_seller
from backend.app.attribution import clean_attribution, conversion_context, CAMPAIGN_REPORT_SQL
from pglast import parse_sql

def context():
    return {'session_id':str(uuid4()),'details':{'source':'instagram','medium':'social','campaign':'aban_1405','phone':'private','description':'private'}}

def event_params(db):
    return [p for sql,p in db.calls if 'INSERT INTO app.site_events' in sql]

def test_contact_conversion_keeps_campaign_not_form_contents(env):
    db,client=env; ctx=context()
    r=client.post('/api/public/contact-requests',json={'name':'علی احمدی','phone':'09212745755','description':'private body','analytics':ctx})
    assert r.status_code==201
    assert len(event_params(db))==1
    event,session,path,details=event_params(db)[0]
    assert event=='contact_submit' and str(session)==ctx['session_id'] and path=='/contact'
    assert details.obj=={'source':'instagram','medium':'social','campaign':'aban_1405'}

def test_failed_or_honeypot_contact_never_counts(env):
    db,client=env
    assert client.post('/api/public/contact-requests',json={'name':'علی','phone':'123','analytics':context()}).status_code==422
    assert client.post('/api/public/contact-requests',json={'name':'علی','phone':'09212745755','website':'bot','analytics':context()}).status_code==201
    assert not event_params(db)

def test_legacy_and_dnt_forms_count_without_anonymous_identity(env):
    db,client=env
    for ctx in [None,{'session_id':'invalid','details':{'source':'fake'}}]:
        assert client.post('/api/public/contact-requests',json={'name':'علی','phone':'09212745755','analytics':ctx}).status_code==201
    assert all(p[1] is None and p[-1].obj=={} for p in event_params(db))

def test_seller_conversion_same_transaction_and_no_tracking_in_property_details(env):
    db,client=env; ctx=context()
    main.app.dependency_overrides[require_seller]=lambda:{'id':USER['sub'],'role':'seller','phone':'09212745755'}
    original=db.execute
    def execute(sql,params=()):
        if 'INSERT INTO app.property_submissions' in sql:
            original(sql,params)
            result=MagicMock();result.fetchone.return_value={'id':uuid4()};return result
        return original(sql,params)
    db.execute=execute
    r=client.post('/api/seller/property-submissions',json={'seller_name':'علی','seller_phone':'09212745755','kind':'apartment','building_area_m2':120,'asking_price_toman':3000000000,'analytics':ctx})
    assert r.status_code==201
    assert len(event_params(db))==1 and event_params(db)[0][0]=='property_submit'
    assert str(event_params(db)[0][1])==ctx['session_id']
    saved=next(p for sql,p in db.calls if 'INSERT INTO app.property_submissions' in sql)[-1].obj
    assert 'analytics' not in saved and 'session_id' not in saved

def test_public_browser_events_cannot_claim_successful_server_conversions(env):
    db,client=env
    for name in ['contact_submit','property_submit']:
        r=client.post('/api/public/events',json={'event':name,'session_id':str(uuid4()),'path':'/'})
        assert r.status_code==422
    assert not event_params(db)

def test_sanitization_and_report_sql():
    assert clean_attribution({'source':'instagram','campaign':'آبان ۱۴۰۵','referrer':'https://example.com/?token=private','phone':'private'})=={'source':'instagram','campaign':'آبان ۱۴۰۵'}
    assert conversion_context('invalid')==(None,{})
    assert clean_attribution({'campaign':'x'*1000})=={'campaign':'x'*120}
    parse_sql(CAMPAIGN_REPORT_SQL.replace('%s','7'))

def test_report_is_private_and_passes_period_without_interpolation(env):
    db,client=env
    assert client.get('/api/admin/analytics').status_code==401
    admin();assert client.get('/api/admin/analytics?days=30').status_code==200
    assert any(sql==CAMPAIGN_REPORT_SQL and params==(30,) for sql,params in db.calls)
