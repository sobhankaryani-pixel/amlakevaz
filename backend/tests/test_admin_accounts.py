"""Owner management API contracts, isolated from production accounts."""
import os
import re
from pathlib import Path
from uuid import uuid4
from unittest.mock import MagicMock
os.environ.setdefault('DATABASE_URL', 'postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET', 'test-secret-only')
import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation
from pglast import parse_sql
from backend.app import main, auth, admin_accounts as accounts


@pytest.fixture
def env(monkeypatch):
    owner = {'sub': str(uuid4()), 'role': 'owner'}
    target = {'id': str(uuid4()), 'username': 'agent1', 'email': None, 'role': 'admin',
              'is_active': True, 'created_at': '2026-10-30T00:00:00Z'}
    db = MagicMock()
    conn = db.connection.return_value.__enter__.return_value
    calls = []
    def execute(sql, params=()):
        parse_sql(re.sub('%s', 'NULL', sql))
        calls.append((sql, params))
        cursor = MagicMock()
        cursor.fetchone.return_value = dict(target)
        cursor.fetchall.return_value = [dict(target)]
        return cursor
    conn.execute.side_effect = execute
    monkeypatch.setattr(accounts, 'pool', db)
    main.app.dependency_overrides.clear()
    main.app.dependency_overrides[auth.current_user] = lambda: owner
    yield owner, target, conn, calls, TestClient(main.app)
    main.app.dependency_overrides.clear()


def test_owner_lists_public_fields_only(env):
    owner, target, conn, calls, client = env
    r = client.get('/api/admin/accounts')
    assert r.status_code == 200
    assert r.json()['items'] == [target]
    assert 'password_hash' not in calls[0][0]


@pytest.mark.parametrize('role', ['admin', 'data_entry', 'analyst', 'editor', 'viewer'])
def test_non_owner_cannot_list_create_or_update_accounts(env, role):
    owner, target, conn, calls, client = env
    owner['role'] = role
    assert client.get('/api/admin/accounts').status_code == 403
    assert client.post('/api/admin/accounts', json={'username':'agent2','password':'example-password'}).status_code == 403
    assert client.put('/api/admin/accounts/'+target['id'], json={'is_active':False}).status_code == 403
    assert not calls


def test_create_hashes_password_and_audits_without_secrets(env):
    owner, target, conn, calls, client = env
    r = client.post('/api/admin/accounts', json={'username':'Agent2','password':'example-password','role':'admin'})
    assert r.status_code == 201
    sql, params = calls[0]
    assert params[0] == 'agent2'
    assert params[1] != 'example-password'
    assert auth.verify_password('example-password', params[1])
    assert calls[1][1] == (owner['sub'], target['id'])
    assert 'example-password' not in r.text
    assert 'password_hash' not in r.text
    assert 'email' not in sql.split('VALUES')[0]


@pytest.mark.parametrize('body', [
    {'username':'has space','password':'example-password'},
    {'username':'a','password':'example-password'},
    {'username':'agent2','password':'short'},
    {'username':'agent2','password':'example-password','role':'owner'},
    {'username':'agent2','password':'example-password','role':'unknown'},
])
def test_create_rejects_invalid_credentials_and_owner_escalation(env, body):
    owner, target, conn, calls, client = env
    assert client.post('/api/admin/accounts', json=body).status_code == 422
    assert not calls


def test_duplicate_username_is_a_readable_conflict(env):
    owner, target, conn, calls, client = env
    conn.execute.side_effect = UniqueViolation('test duplicate')
    assert client.post('/api/admin/accounts',json={'username':'agent2','password':'example-password'}).status_code == 409


def test_disable_and_reenable_both_increment_session_version(env):
    owner, target, conn, calls, client = env
    for active in (False, True):
        assert client.put('/api/admin/accounts/'+target['id'], json={'is_active':active}).status_code == 200
    updates = [(s,p) for s,p in calls if s.startswith('UPDATE')]
    assert len(updates) == 2
    assert all('session_version=session_version+1' in s for s,p in updates)
    assert [p[0] for s,p in updates] == [False, True]


def test_password_reset_and_username_update_are_hashed_and_revoke(env):
    owner, target, conn, calls, client = env
    r=client.put('/api/admin/accounts/'+target['id'],json={'username':'Agent3','password':'new-example-password','role':'viewer'})
    assert r.status_code == 200
    sql,params=next((s,p) for s,p in calls if s.startswith('UPDATE'))
    assert 'session_version=session_version+1' in sql
    assert params[0]=='agent3'
    assert auth.verify_password('new-example-password',params[1])
    assert 'new-example-password' not in r.text


def test_owner_cannot_disable_or_demote_self_or_edit_other_owner(env):
    owner, target, conn, calls, client = env
    target.update(id=owner['sub'],role='owner')
    for body in ({'is_active':False},{'role':'admin'},{'role':'owner'}):
        assert client.put('/api/admin/accounts/'+target['id'],json=body).status_code in (403,422)
    assert not any(s.startswith('UPDATE') for s,p in calls)
    r=client.put('/api/admin/accounts/'+target['id'],json={'username':'ownername'})
    assert r.status_code==200 and r.json()['sign_in_again'] is True
    target['id']=str(uuid4())
    assert client.put('/api/admin/accounts/'+target['id'],json={'username':'owner2'}).status_code==403


def test_empty_update_and_invalid_uuid_are_rejected(env):
    owner, target, conn, calls, client = env
    assert client.put('/api/admin/accounts/'+target['id'],json={}).status_code==422
    assert client.put('/api/admin/accounts/bad-id',json={'is_active':False}).status_code==422
    assert not calls


def test_migration_parses_and_is_repeatable_in_structure():
    sql=(Path(__file__).resolve().parents[2]/'database/migrations/0014_admin_usernames.sql').read_text()
    parse_sql(sql)
    assert 'IF NOT EXISTS username' in sql
    assert 'lower(username)' in sql
    assert 'DROP NOT NULL' in sql


def test_login_accepts_normalized_username_and_legacy_email(env, monkeypatch):
    owner, target, conn, calls, client = env
    monkeypatch.setattr(main,'pool',MagicMock())
    login_conn=main.pool.connection.return_value.__enter__.return_value
    login_conn.execute.return_value.fetchone.return_value={**target,'password_hash':'isolated-hash','session_version':3}
    monkeypatch.setattr(main,'limit_request',lambda *a,**kw:None)
    monkeypatch.setattr(main,'verify_password',lambda *a:True)
    for body in ({'username':'  Agent1  ','password':'example-password'}, {'email':'test@example.invalid','password':'example-password'}):
        r=client.post('/api/auth/login',json=body)
        assert r.status_code==200
    sql,params=login_conn.execute.call_args.args
    assert 'username IS NULL' in sql
    assert params==('test@example.invalid','test@example.invalid')
