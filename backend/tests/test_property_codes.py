from uuid import uuid4
from datetime import datetime,timezone
from backend.tests.test_launch import env,admin,USER,Cursor
from backend.app import main,property_codes as codes

def setup(db,monkeypatch):
    monkeypatch.setattr(codes,'pool',db)
    original=db.execute;reservations={}
    def execute(sql,params=()):
        result=original(sql,params)
        if 'SELECT * FROM app.property_code_reservations' in sql:
            field='request_id' if 'WHERE request_id=' in sql else 'id'
            return Cursor([r for r in reservations.values() if str(r[field])==str(params[0])])
        if 'INSERT INTO app.property_code_reservations' in sql:
            row={'id':uuid4(),'request_id':params[0],'owner_id':params[1],'public_code':params[2],'consumed_at':None,'property_id':None,'request_hash':None}
            reservations[str(row['id'])]=row;return Cursor([row])
        if 'UPDATE app.property_code_reservations SET consumed_at' in sql:
            row=reservations[str(params[2])];row.update(property_id=params[0],request_hash=params[1],consumed_at=datetime.now(timezone.utc))
        return result
    db.execute=execute
    return reservations

def test_reservation_requires_role_and_same_request_is_idempotent(env,monkeypatch):
    db,c=env;setup(db,monkeypatch);request={'request_id':str(uuid4())}
    assert c.post('/api/admin/properties/reserve-code',json=request).status_code==401
    admin();first=c.post('/api/admin/properties/reserve-code',json=request);second=c.post('/api/admin/properties/reserve-code',json=request)
    assert first.status_code==200 and first.json()==second.json() and first.json()['public_code']=='02'
    assert sum('SELECT app.allocate_property_code()' in sql for sql,_ in db.calls)==1

def test_manual_code_is_ignored_and_retry_does_not_create_duplicate(env,monkeypatch):
    db,c=env;setup(db,monkeypatch);admin()
    reservation=c.post('/api/admin/properties/reserve-code',json={'request_id':str(uuid4())}).json()
    payload={'code_reservation_id':reservation['reservation_id'],'public_code':'manual-forged','property_type_id':USER['sub'],'region_id':USER['sub'],'status':'آگهی فروش','asking_price_toman':5000000000,'notes':'توضیحات زمین'}
    assert c.post('/api/admin/properties/direct',json=payload).json()['public_code']=='02'
    again=c.post('/api/admin/properties/direct',json=payload)
    assert again.status_code==200 and again.json()['already_created'] is True
    assert sum('INSERT INTO app.properties' in sql for sql,_ in db.calls)==1
    assert c.post('/api/admin/properties/direct',json={**payload,'asking_price_toman':6000000000}).status_code==409

def test_create_without_reservation_is_also_server_numbered(env):
    db,c=env;admin()
    payload={'property_type_id':USER['sub'],'region_id':USER['sub'],'status':'آگهی فروش','asking_price_toman':5000000000}
    assert c.post('/api/admin/properties/direct',json=payload).json()['public_code']=='02'
    assert next(p for sql,p in db.calls if 'INSERT INTO app.properties' in sql)[0]=='02'
    assert c.post('/api/admin/properties',json={'property_type_id':USER['sub'],'public_code':'manual'}).json()['public_code']=='02'

def test_existing_property_code_cannot_change(env):
    _,c=env;admin()
    payload={'public_code':'999','property_type_id':USER['sub'],'region_id':USER['sub'],'status':'آگهی فروش','asking_price_toman':5000000000}
    assert c.put('/api/admin/properties/01/direct',json=payload).status_code==422
