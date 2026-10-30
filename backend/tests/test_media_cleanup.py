"""Offline cleanup API checks. Storage is always a stub, never production."""
import os,re
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from unittest.mock import MagicMock
import pytest,jwt
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
from fastapi.testclient import TestClient
from pglast import parse_sql
from backend.app import main,media_cleanup as cleanup
from backend.app.auth import current_user
from backend.app.seller_auth import require_seller

@pytest.fixture
def env(monkeypatch):
    now=datetime.now(timezone.utc);identifier=uuid4();owner={'sub':str(uuid4()),'role':'owner'}
    row={'id':identifier,'filename':str(identifier)+'.webp','owner_id':owner['sub'],'owner_role':'owner','kind':'image','size_bytes':1234,'created_at':now-timedelta(days=80),'retain_until':now-timedelta(days=2),'cleanup_state':'active'}
    conn=MagicMock();db=MagicMock();db.connection.return_value.__enter__.return_value=conn
    calls=[];state={'safe':True,'rows':[row],'fail_final':False}
    def execute(sql,params=()):
        parse_sql(re.sub('%s','NULL',sql));calls.append((sql,params));cur=MagicMock()
        if 'count(*) AS files' in sql:cur.fetchone.return_value={'files':1,'bytes':1234}
        elif 'SELECT * FROM app.uploaded_media' in sql:cur.fetchone.return_value=dict(row)
        elif 'SELECT u.id FROM app.uploaded_media' in sql:cur.fetchone.return_value={'id':identifier} if state['safe'] else None
        elif "SET cleanup_state='deleting'" in sql:row['cleanup_state']='deleting'
        elif "SET cleanup_state='deleted'" in sql:
            if state['fail_final']:raise RuntimeError('simulated final DB outage')
            row['cleanup_state']='deleted'
        if 'SELECT u.id,u.filename' in sql or 'SELECT id,filename,owner_id' in sql:cur.fetchall.return_value=[dict(r) for r in state['rows']]
        return cur
    conn.execute.side_effect=execute
    monkeypatch.setattr(cleanup,'pool',db);monkeypatch.setattr(cleanup,'limit_request',lambda *args:None)
    monkeypatch.setattr(cleanup.media_storage,'configured',lambda:True);monkeypatch.setattr(cleanup.media_storage,'mode',lambda:'s3')
    storage=MagicMock();monkeypatch.setattr(cleanup.media_storage,'delete_for_cleanup',storage)
    main.app.dependency_overrides.clear()
    yield owner,row,state,conn,calls,storage,TestClient(main.app,raise_server_exceptions=False)
    main.app.dependency_overrides.clear()

def authorize(owner):main.app.dependency_overrides[current_user]=lambda:owner
def payload(owner,row):return {'id':str(row['id']),'preview_token':cleanup.preview_token(row,owner),'confirm':'حذف دائمی'}

def test_preview_and_delete_owner_only(env):
    owner,row,state,conn,calls,storage,c=env
    assert c.get('/api/admin/media/cleanup-preview').status_code==401
    for role in ['admin','data_entry','viewer']:
        authorize({**owner,'role':role})
        assert c.get('/api/admin/media/cleanup-preview').status_code==403
        assert c.post('/api/admin/media/cleanup-delete',json=payload(owner,row)).status_code==403
    storage.assert_not_called()

def test_preview_is_read_only_and_includes_all_reference_checks(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner)
    r=c.get('/api/admin/media/cleanup-preview');assert r.status_code==200
    assert r.json()['items'][0]['filename']==row['filename']
    assert 'preview_token' in r.json()['items'][0]
    assert all('UPDATE ' not in sql for sql,_ in calls)
    assert all(name in cleanup.REFERENCES for name in ['app.properties','app.property_submissions','app.homepage_promotions'])
    storage.assert_not_called()

def test_wrong_confirmation_stale_or_other_owner_token_cannot_delete(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner)
    body=payload(owner,row)
    assert c.post('/api/admin/media/cleanup-delete',json={**body,'confirm':''}).status_code==422
    assert c.post('/api/admin/media/cleanup-delete',json={**body,'preview_token':'tampered'}).status_code==409
    other={**owner,'sub':str(uuid4())}
    assert c.post('/api/admin/media/cleanup-delete',json=payload(other,row)).status_code==409
    claims={'sub':owner['sub'],'media_id':str(row['id']),'filename':row['filename'],'aud':'media-cleanup','exp':datetime.now(timezone.utc)-timedelta(seconds=1)}
    assert c.post('/api/admin/media/cleanup-delete',json={**body,'preview_token':jwt.encode(claims,cleanup.settings.jwt_secret,algorithm='HS256')}).status_code==409
    storage.assert_not_called()

def test_reference_or_lease_changed_after_preview_blocks_deletion(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner);body=payload(owner,row);state['safe']=False
    assert c.post('/api/admin/media/cleanup-delete',json=body).status_code==409
    assert row['cleanup_state']=='active';storage.assert_not_called()

def test_delete_reserves_before_storage_and_is_idempotent(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner);body=payload(owner,row)
    def delete(filename):
        assert row['cleanup_state']=='deleting';assert conn.commit.call_count>=1
        assert any('FOR UPDATE' in sql for sql,_ in calls);assert filename==row['filename']
    storage.side_effect=delete
    assert c.post('/api/admin/media/cleanup-delete',json=body).json()['deleted'] is True
    assert row['cleanup_state']=='deleted'
    assert c.post('/api/admin/media/cleanup-delete',json=body).json()['already_deleted'] is True
    storage.assert_called_once()

def test_ambiguous_storage_failure_stays_reserved_and_explicit_retry_finishes(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner);body=payload(owner,row)
    storage.side_effect=RuntimeError('provider details must not leak')
    r=c.post('/api/admin/media/cleanup-delete',json=body)
    assert r.status_code==503 and 'provider details' not in r.text and row['cleanup_state']=='deleting'
    storage.side_effect=None
    assert c.post('/api/admin/media/cleanup-delete',json=body).status_code==200
    assert row['cleanup_state']=='deleted'

def test_storage_success_db_failure_remains_retryable(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner);body=payload(owner,row);state['fail_final']=True
    assert c.post('/api/admin/media/cleanup-delete',json=body).status_code==500
    assert row['cleanup_state']=='deleting';state['fail_final']=False
    assert c.post('/api/admin/media/cleanup-delete',json=body).status_code==200

def test_draft_lease_is_owner_checked_and_rejects_deleting_files(env):
    owner,row,state,conn,calls,storage,c=env
    seller={'id':str(uuid4()),'phone':'09212745755'}
    main.app.dependency_overrides[require_seller]=lambda:seller
    body={'urls':[cleanup.MEDIA_BASE+'/'+row['filename']]}
    assert c.post('/api/seller/media/retain',json=body).status_code==403
    row.update(owner_id=seller['id'],owner_role='seller')
    assert c.post('/api/seller/media/retain',json=body).json()['retained']==1
    assert any('GREATEST(retain_until' in sql for sql,_ in calls)
    row['cleanup_state']='deleting';assert c.post('/api/seller/media/retain',json=body).status_code==409
    assert c.post('/api/seller/media/retain',json={'urls':['https://evil.invalid/a.webp']}).status_code==422
    storage.assert_not_called()

def test_cleanup_ignores_unsafe_filename_even_if_registry_is_corrupt(env):
    owner,row,state,conn,calls,storage,c=env;authorize(owner);row['filename']='../outside.webp'
    assert c.get('/api/admin/media/cleanup-preview').json()['items']==[]
    assert c.post('/api/admin/media/cleanup-delete',json=payload(owner,row)).status_code==409
    storage.assert_not_called()

def test_local_cleanup_removes_only_managed_file(env,monkeypatch,tmp_path):
    owner,row,state,conn,calls,storage,c=env;authorize(owner)
    monkeypatch.setenv('MEDIA_DIR',str(tmp_path));monkeypatch.setattr(cleanup.media_storage,'mode',lambda:'local')
    target=tmp_path/row['filename'];target.write_bytes(b'test');other=tmp_path/'keep.txt';other.write_bytes(b'keep')
    assert c.post('/api/admin/media/cleanup-delete',json=payload(owner,row)).status_code==200
    assert not target.exists() and other.read_bytes()==b'keep';storage.assert_not_called()

def test_local_symlink_never_deletes_external_target(env,monkeypatch,tmp_path):
    owner,row,state,conn,calls,storage,c=env;authorize(owner)
    monkeypatch.setenv('MEDIA_DIR',str(tmp_path));monkeypatch.setattr(cleanup.media_storage,'mode',lambda:'local')
    target=tmp_path/'keep.txt';target.write_bytes(b'keep');(tmp_path/row['filename']).symlink_to(target)
    assert c.post('/api/admin/media/cleanup-delete',json=payload(owner,row)).status_code==503
    assert target.read_bytes()==b'keep'

def test_trigger_conflict_is_a_readable_409_for_form_submission(env,monkeypatch):
    from types import SimpleNamespace
    from psycopg.errors import CheckViolation
    class GuardConflict(CheckViolation):
        @property
        def diag(self):return SimpleNamespace(constraint_name='media_cleanup_reference_guard')
    owner,row,state,conn,calls,storage,c=env
    main.app.dependency_overrides[require_seller]=lambda:{'id':owner['sub'],'phone':'09212745755'}
    def conflict(*args):raise GuardConflict()
    monkeypatch.setattr(main,'validate_media',conflict)
    monkeypatch.setattr(main,'limit_request',lambda *args:None)
    r=c.post('/api/seller/property-submissions',json={'seller_name':'علی','seller_phone':'09212745755','kind':'apartment','building_area_m2':100,'asking_price_toman':3000000000})
    assert r.status_code==409 and 'دوباره بارگذاری' in r.json()['detail']

def test_storage_delete_uses_one_finite_attempt(env,monkeypatch):
    factory=MagicMock();monkeypatch.setattr(cleanup.media_storage.boto3,'client',factory)
    cleanup.media_storage._cleanup_client.cache_clear()
    cleanup.media_storage._cleanup_client('https://example.invalid','test-key','test-secret','test-region')
    config=factory.call_args.kwargs['config']
    assert config.connect_timeout==5 and config.read_timeout==15
    assert config.retries['total_max_attempts']==1
    cleanup.media_storage._cleanup_client.cache_clear()
