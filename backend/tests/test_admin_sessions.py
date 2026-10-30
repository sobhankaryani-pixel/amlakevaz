"""Exercise real JWT validation and role dependencies, with an isolated user DB."""
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from unittest.mock import MagicMock

os.environ.setdefault('DATABASE_URL', 'postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET', 'test-secret-only')

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from backend.app import auth, main


@pytest.fixture
def session(monkeypatch):
    user = {'id': str(uuid4()), 'role': 'owner', 'is_active': True,
            'password_hash': 'isolated-password-hash-not-a-real-password'}
    db = MagicMock()
    conn = db.connection.return_value.__enter__.return_value
    cursor = conn.execute.return_value
    cursor.fetchone.side_effect = lambda: dict(user) if user else None
    monkeypatch.setattr(auth, 'pool', db)
    app = FastAPI()

    @app.get('/me')
    def me(account=Depends(auth.current_user)):
        return account

    @app.post('/write')
    def write(account=Depends(auth.require_roles('owner', 'admin'))):
        return {'saved': True}

    client = TestClient(app, raise_server_exceptions=False)
    token = auth.create_token(user['id'], user['role'], user['password_hash'])
    return user, db, conn, client, token


def headers(token):
    return {'Authorization': 'Bearer ' + token}


def test_valid_session_does_not_expose_password_or_stamp(session):
    user, db, conn, client, token = session
    response = client.get('/me', headers=headers(token))
    assert response.status_code == 200
    assert response.json()['sub'] == user['id']
    assert set(response.json()) == {'sub', 'role', 'exp'}
    assert user['password_hash'] not in jwt.decode(token, auth.settings.jwt_secret, algorithms=['HS256']).values()
    assert client.post('/write', headers=headers(token)).status_code == 200
    assert conn.execute.call_args.args[1] == (user['id'],)


def test_disabled_account_immediately_loses_existing_session(session):
    user, db, conn, client, token = session
    assert client.post('/write', headers=headers(token)).status_code == 200
    user['is_active'] = False
    assert client.post('/write', headers=headers(token)).status_code == 401


def test_deleted_account_is_rejected(session):
    user, db, conn, client, token = session
    user.clear()
    assert client.get('/me', headers=headers(token)).status_code == 401


def test_role_changes_override_old_token_without_cache(session):
    user, db, conn, client, token = session
    user['role'] = 'viewer'
    assert client.get('/me', headers=headers(token)).json()['role'] == 'viewer'
    assert client.post('/write', headers=headers(token)).status_code == 403
    user['role'] = 'admin'
    assert client.post('/write', headers=headers(token)).status_code == 200
    user['role'] = 'unknown'
    assert client.get('/me', headers=headers(token)).status_code == 401


def test_password_reset_revokes_old_token_and_accepts_new_login(session):
    user, db, conn, client, token = session
    user['password_hash'] = 'new-isolated-password-hash'
    assert client.get('/me', headers=headers(token)).status_code == 401
    fresh = auth.create_token(user['id'], user['role'], user['password_hash'])
    assert client.get('/me', headers=headers(fresh)).status_code == 200


def test_invalid_tokens_rejected_before_database_access(session):
    user, db, conn, client, token = session
    claims = jwt.decode(token, auth.settings.jwt_secret, algorithms=['HS256'])
    invalid = [token + 'bad', 'not-a-jwt']
    for field in ('exp', 'sub', 'session_stamp'):
        invalid.append(jwt.encode({k: v for k, v in claims.items() if k != field}, auth.settings.jwt_secret, algorithm='HS256'))
    for field, value in [('sub', 'not-a-uuid'), ('sub', None), ('session_stamp', []), ('session_stamp', 'é'*64),
                         ('exp', datetime.now(timezone.utc)-timedelta(seconds=2))]:
        invalid.append(jwt.encode({**claims, field: value}, auth.settings.jwt_secret, algorithm='HS256'))
    invalid.append(jwt.encode(claims, 'different-test-secret', algorithm='HS256'))
    for bad in invalid:
        assert client.get('/me', headers=headers(bad)).status_code == 401
    assert client.get('/me').status_code == 401
    db.connection.assert_not_called()


def test_old_admin_token_without_stamp_requires_new_login(session):
    user, db, conn, client, token = session
    legacy = jwt.encode({'sub': user['id'], 'role': 'owner',
                         'exp': datetime.now(timezone.utc)+timedelta(hours=8)},
                        auth.settings.jwt_secret, algorithm='HS256')
    assert client.get('/me', headers=headers(legacy)).status_code == 401


def test_database_failure_does_not_fall_back_to_token_role(session):
    user, db, conn, client, token = session
    db.connection.side_effect = RuntimeError('isolated database failure')
    assert client.post('/write', headers=headers(token)).status_code == 500


def test_login_endpoint_issues_password_bound_session(session, monkeypatch):
    user, db, conn, client, token = session
    monkeypatch.setattr(main, 'pool', db)
    monkeypatch.setattr(main, 'limit_request', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'verify_password', lambda password, stored: password == 'test-password')
    main.app.dependency_overrides.clear()
    response = TestClient(main.app).post('/api/auth/login', json={'email': 'test@example.invalid', 'password': 'test-password'})
    assert response.status_code == 200
    issued = response.json()['access_token']
    assert client.get('/me', headers=headers(issued)).status_code == 200
    user['password_hash'] = 'changed'
    assert client.get('/me', headers=headers(issued)).status_code == 401
