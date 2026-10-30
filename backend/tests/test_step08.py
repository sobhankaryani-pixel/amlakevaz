from uuid import uuid4
import pytest
from backend.tests.test_launch import env,admin,USER,Cursor
from backend.app import main
from backend.app.auth import current_user
from backend.app.seller_auth import require_seller

def list_db(db):
    original=db.execute
    def execute(sql,params=()):
        result=original(sql,params)
        if 'SELECT count(*) AS total FROM app.properties' in sql:return Cursor([{'total':245}])
        if 'ORDER BY p.created_at DESC,p.id DESC LIMIT' in sql:return Cursor([{'public_code':'145','commercial_area_m2':55}])
        return result
    db.execute=execute

def test_private_paginated_list_beyond_100_and_literal_code_filter(env):
    db,c=env;list_db(db)
    assert c.get('/api/admin/properties/direct?offset=100').status_code==401
    admin();r=c.get('/api/admin/properties/direct?offset=100&limit=50&code=۱۴۵')
    assert r.status_code==200 and r.json()['total']==245 and r.json()['offset']==100
    assert r.json()['items'][0]['public_code']=='145'
    assert any(params==('145',50,100) for sql,params in db.calls)
    assert any('ORDER BY p.created_at DESC,p.id DESC' in sql for sql,_ in db.calls)
    for query in ['offset=-1','limit=0','limit=101','code='+('x'*81),'offset=3000000000']:
        assert c.get('/api/admin/properties/direct?'+query).status_code==422
    main.app.dependency_overrides[current_user]=lambda:{**USER,'role':'viewer'}
    assert c.get('/api/admin/properties/direct?offset=200').status_code==200

@pytest.mark.parametrize('kind,fields',[('shop',{'commercial_area_m2':55,'street_frontage_m':5}),('garden',{'area_m2':300,'land_length_m':20,'land_width_m':15})])
def test_new_seller_types_save_private_details_for_review(env,kind,fields):
    db,c=env;main.app.dependency_overrides[require_seller]=lambda:{'id':USER['sub'],'phone':'09212745755'}
    original=db.execute
    def execute(sql,params=()):
        result=original(sql,params)
        if 'INSERT INTO app.property_submissions' in sql:return Cursor([{'id':uuid4()}])
        return result
    db.execute=execute
    payload={'kind':kind,'seller_name':'علی','seller_phone':'09212745755','asking_price_toman':5000000000,'extra_details':'درخواست برای بررسی',**fields}
    r=c.post('/api/seller/property-submissions',json=payload);assert r.status_code==201
    params=next(p for sql,p in db.calls if 'INSERT INTO app.property_submissions' in sql)
    assert params[3]==kind and all(params[-1].obj[k]==v for k,v in fields.items())
    assert not any('INSERT INTO app.properties' in sql or 'INSERT INTO app.listings' in sql for sql,_ in db.calls)
    assert 'تأیید مدیر' in r.json()['message']

@pytest.mark.parametrize('kind,field',[('shop','commercial_area_m2'),('garden','area_m2')])
def test_new_types_require_positive_area_and_disallow_video(env,kind,field):
    _,c=env;main.app.dependency_overrides[require_seller]=lambda:{'id':USER['sub'],'phone':'09212745755'}
    base={'kind':kind,'seller_name':'علی','seller_phone':'09212745755','asking_price_toman':5000000000}
    for value in [None,0,-1]:
        assert c.post('/api/seller/property-submissions',json={**base,field:value}).status_code==422
    assert c.post('/api/seller/property-submissions',json={**base,field:50,'media':[{'url':'https://api.evazmelk.ir/api/public/media/'+str(uuid4())+'.mp4','kind':'video'}]}).status_code==422
