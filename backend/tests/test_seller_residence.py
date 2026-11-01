"""Offline profile persistence and validation; no production sessions or SMS."""
import os
os.environ.setdefault('DATABASE_URL','postgresql://test:test@127.0.0.1/test')
os.environ.setdefault('JWT_SECRET','test-secret-only')
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.app import seller_auth as module
CITIES=['اوز','کهنه','کهنه جدید','قلات','اسلام آباد','گلار','کوره','بیدشهر','هود','هیرم','فیشور','محلچه','گراش','لار']
USER={'id':'test-user','phone':'09120000000','name':'کاربر آزمایشی','marketing_opt_in':False,'residence_city':'لار'}
class Database:
    def __init__(self): self.calls=[]
    def connection(self): return self
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def commit(self): pass
    def execute(self,sql,params):
        self.calls.append((sql,params))
        if sql.startswith('UPDATE'):
            return type('Cursor',(),{'fetchone':lambda _:dict(USER,name=params[0],residence_city=params[1] or USER['residence_city'],marketing_opt_in=params[2])})()
        return type('Cursor',(),{'fetchone':lambda _:USER})()
@pytest.fixture
def api(monkeypatch):
    db=Database();monkeypatch.setattr(module,'pool',db)
    app=FastAPI();app.include_router(module.seller);app.dependency_overrides[module.require_seller]=lambda:USER
    return TestClient(app),db
@pytest.mark.parametrize('city',CITIES)
def test_allowed_city_persists(api,city):
    client,db=api
    response=client.put('/api/seller/me',json={'name':'  کاربر آزمایشی  ','residence_city':city,'marketing_opt_in':False})
    assert response.status_code==200
    assert response.json()['user']['residence_city']==city
    assert db.calls[-1][1][0]=='کاربر آزمایشی'
    assert 'residence_city' in db.calls[-1][0]
def test_reject_unknown_city_and_blank_name(api):
    client,db=api
    for payload in [{'name':'کاربر','residence_city':'شهر ناشناخته'},{'name':'  ','residence_city':'اوز'}]:
        assert client.put('/api/seller/me',json=payload).status_code==422
    assert not db.calls
def test_old_client_preserves_existing_city_and_me_returns_it(api):
    client,_=api
    assert client.put('/api/seller/me',json={'name':'کاربر'}).json()['user']['residence_city']=='لار'
    assert client.get('/api/seller/me').json()['user']['residence_city']=='لار'
def test_profile_requires_authentication(monkeypatch):
    app=FastAPI();app.include_router(module.seller)
    assert TestClient(app).put('/api/seller/me',json={'name':'کاربر','residence_city':'اوز'}).status_code==401
