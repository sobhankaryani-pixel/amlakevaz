from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import pool, open_pool, close_pool
from .auth import require_roles, verify_password, create_token
from .price_series import SEGMENTS, sale_series

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Enable this only when DATABASE_URL points to a real/staging PostgreSQL instance.
    open_pool(); yield; close_pool()

app = FastAPI(title="Evaz Property Index API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.allowed_origins.split(",")], allow_credentials=True, allow_methods=["GET","POST","PUT","DELETE"], allow_headers=["Authorization","Content-Type"])

public = APIRouter(prefix="/api/public", tags=["public"])
admin = APIRouter(prefix="/api/admin", tags=["admin"])

class PropertyIn(BaseModel):
    public_code: str = Field(min_length=2, max_length=80)
    property_type_id: str
    area_m2: float | None = Field(default=None, gt=0)
    building_area_m2: float | None = Field(default=None, gt=0)
    floor: int | None = None
    build_year: int | None = None

class ListingIn(BaseModel):
    market_record_id: str
    asking_price_toman: int = Field(gt=0)
    price_per_m2_toman: int | None = Field(default=None, gt=0)

class TransactionIn(BaseModel):
    market_record_id: str
    transaction_month: str
    final_price_toman: int = Field(gt=0)
    price_per_m2_toman: int | None = Field(default=None, gt=0)

class LoginIn(BaseModel):
    email: str
    password: str = Field(min_length=8)

@app.get("/health", tags=["system"])
def health():
    with pool.connection() as conn:
        conn.execute("SELECT 1").fetchone()
    return {"status": "ok", "service": "evaz-property-index-api", "database": "ok"}

@app.post("/api/auth/login", tags=["auth"])
def login(payload: LoginIn):
    with pool.connection() as conn:
        user = conn.execute("SELECT id,email,password_hash,role FROM app.users WHERE email=%s AND is_active=true", (payload.email.lower().strip(),)).fetchone()
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"access_token": create_token(str(user["id"]), user["role"]), "token_type": "bearer", "role": user["role"]}

@public.get("/indices")
def public_indices(): return {"items": [], "message": "Published indices will appear here."}

@public.get("/price-series")
def public_price_series(source: str = "manual", region: str = "all"):
    if source not in ("manual", "sales") or len(region) > 30:
        raise HTTPException(422, "فیلتر نامعتبر است")
    with pool.connection() as conn:
        regions = conn.execute("SELECT name,slug FROM app.regions WHERE is_public=true AND slug LIKE 'R-%' ORDER BY slug").fetchall()
        if region != 'all' and region not in {r['slug'] for r in regions}:
            raise HTTPException(422, "منطقه معتبر نیست")
        if source == 'manual':
            rows = conn.execute("""SELECT period,segment,region_key,value_toman FROM app.monthly_price_estimates
                 WHERE region_key=%s ORDER BY period""", (region,)).fetchall()
            series = {s: [] for s in SEGMENTS}
            for r in rows:
                if r['segment'] in series:
                    series[r['segment']].append({'period': r['period'], 'value_toman': r['value_toman'], 'count': None})
        else:
            rows = conn.execute("""SELECT t.code,p.usage_type,p.house_condition,p.mehr_level,p.area_m2,p.building_area_m2,
                    r.slug AS region_key,s.sale_date,s.sale_price_toman
                    FROM app.property_sales s JOIN app.properties p ON p.id=s.property_id
                    JOIN app.property_types t ON t.id=p.property_type_id
                    LEFT JOIN app.regions r ON r.id=p.region_id
                    WHERE p.status='فروخته شده'""").fetchall()
            series = {s: [] for s in SEGMENTS}
            series.update(sale_series(rows,region))
    return {'regions': [dict(r) for r in regions], 'source': source, 'series': series}

@public.get("/transactions")
def public_transactions():
    with pool.connection() as conn:
        rows = conn.execute("SELECT transaction_month, final_price_toman, price_per_m2_toman FROM app.transactions WHERE is_public=true ORDER BY transaction_month DESC LIMIT 100").fetchall()
    return {"items": [dict(r) for r in rows]}

@public.get("/listings")
def public_listings():
    with pool.connection() as conn:
        rows = conn.execute("SELECT id, asking_price_toman, price_per_m2_toman, published_at FROM app.listings WHERE is_public=true AND status='published' ORDER BY published_at DESC NULLS LAST LIMIT 100").fetchall()
    return {"items": [dict(r) for r in rows]}

@admin.post("/properties")
def create_property(payload: PropertyIn, user=Depends(require_roles("owner","admin","data_entry"))):
    with pool.connection() as conn:
        try:
            row = conn.execute("INSERT INTO app.properties(public_code,property_type_id,area_m2,building_area_m2,floor,build_year) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id,public_code", (payload.public_code,payload.property_type_id,payload.area_m2,payload.building_area_m2,payload.floor,payload.build_year)).fetchone()
            conn.commit()
        except Exception as exc:
            conn.rollback(); raise HTTPException(400, "Property could not be created") from exc
    return dict(row)

@admin.get("/reference")
def admin_reference(user=Depends(require_roles("owner","admin","data_entry","analyst","editor","viewer"))):
    with pool.connection() as conn:
        types = conn.execute("SELECT id,code,name,category FROM app.property_types ORDER BY name").fetchall()
        regions = conn.execute("SELECT id,name,slug FROM app.regions ORDER BY name").fetchall()
    return {"property_types": [dict(r) for r in types], "regions": [dict(r) for r in regions]}

@admin.post("/listings")
def create_listing(payload: ListingIn, user=Depends(require_roles("owner","admin","data_entry"))):
    with pool.connection() as conn:
        row = conn.execute("INSERT INTO app.listings(market_record_id,asking_price_toman,price_per_m2_toman) VALUES (%s,%s,%s) RETURNING id", (payload.market_record_id,payload.asking_price_toman,payload.price_per_m2_toman)).fetchone(); conn.commit()
    return dict(row)

@admin.post("/transactions")
def create_transaction(payload: TransactionIn, user=Depends(require_roles("owner","admin","data_entry"))):
    with pool.connection() as conn:
        row = conn.execute("INSERT INTO app.transactions(market_record_id,transaction_month,final_price_toman,price_per_m2_toman) VALUES (%s,%s,%s,%s) RETURNING id", (payload.market_record_id,payload.transaction_month,payload.final_price_toman,payload.price_per_m2_toman)).fetchone(); conn.commit()
    return dict(row)

@admin.get("/me")
def admin_me(user=Depends(require_roles("owner","admin","data_entry","analyst","editor","viewer"))): return user

class DirectPropertyIn(BaseModel):
    public_code: str = Field(min_length=2, max_length=80)
    property_type_id: str
    region_id: str
    neighborhood: str | None = None
    address: str | None = None
    area_m2: float | None = Field(default=None, gt=0)
    building_area_m2: float | None = Field(default=None, gt=0)
    commercial_area_m2: float | None = Field(default=None, gt=0)
    usage_type: str | None = None
    status: str
    asking_price_toman: int | None = Field(default=None, gt=0)
    registration_month: str | None = None
    notes: str | None = None
    street_width: float | None = Field(default=None, gt=0)
    street_frontage_m: float | None = Field(default=None, gt=0)
    mehr_block: str | None = None
    mehr_floor: int | None = None
    mehr_unit: str | None = None
    national_phase: str | None = None
    national_stage: str | None = None
    national_notes: str | None = None
    build_year: int | None = None
    bedrooms: int | None = Field(default=None, ge=0)
    sale_date: str | None = None
    sale_price_toman: int | None = Field(default=None, gt=0)
    sale_notes: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    land_length_m: float | None = Field(default=None, gt=0)
    land_width_m: float | None = Field(default=None, gt=0)
    mehr_section: str | None = None
    mehr_level: str | None = None
    house_condition: str | None = None
    floor_count: int | None = Field(default=None, gt=0)

@public.get("/map-listings")
def map_listings():
    with pool.connection() as conn:
        rows = conn.execute("""SELECT p.public_code, t.code AS property_code, t.name AS property_type, t.category,
          r.name AS region, p.area_m2, p.building_area_m2,
          p.latitude, p.longitude, l.asking_price_toman, p.usage_type,
          p.land_length_m, p.land_width_m, p.mehr_section, p.mehr_level,
          p.house_condition, p.bedrooms, p.floor_count, p.commercial_area_m2,
          p.national_phase, p.national_stage
          FROM app.listings l
          JOIN app.market_records m ON m.id=l.market_record_id
          JOIN app.properties p ON p.id=m.property_id
          JOIN app.property_types t ON t.id=p.property_type_id
          LEFT JOIN app.regions r ON r.id=p.region_id
          WHERE l.is_public=true AND l.status='published'
          AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          ORDER BY l.published_at DESC LIMIT 1000""").fetchall()
    return {"items":[dict(row) for row in rows]}

@admin.post("/properties/direct")
def create_direct_property(payload: DirectPropertyIn, user=Depends(require_roles("owner","admin","data_entry"))):
    if (payload.latitude is None) != (payload.longitude is None):
        raise HTTPException(422, "عرض و طول جغرافیایی باید با هم وارد شوند")
    if payload.status != "آگهی فروش":
        raise HTTPException(422, "وضعیت ملک معتبر نیست")
    if not payload.asking_price_toman:
        raise HTTPException(422, "قیمت پیشنهادی برای آگهی لازم است")
    try:
        with pool.connection() as conn:
            with conn.transaction():
                kind = conn.execute("SELECT id FROM app.property_types WHERE id=%s", (payload.property_type_id,)).fetchone()
                region = conn.execute("SELECT id,name FROM app.regions WHERE id=%s", (payload.region_id,)).fetchone()
                if not kind or not region:
                    raise HTTPException(422, "نوع ملک یا منطقه معتبر نیست")
                if payload.mehr_section and payload.mehr_section not in ("محلی", "فرهنگیان"):
                    raise HTTPException(422, "بخش مسکن مهر معتبر نیست")
                if payload.mehr_level and payload.mehr_level not in ("بالا", "پایین"):
                    raise HTTPException(422, "طبقهٔ مسکن مهر معتبر نیست")
                if payload.house_condition and payload.house_condition not in ("نوساز", "کلنگی"):
                    raise HTTPException(422, "وضعیت ساختمان معتبر نیست")
                row = conn.execute("""INSERT INTO app.properties
                  (public_code,property_type_id,region_id,general_area,private_address,area_m2,
                   building_area_m2,commercial_area_m2,usage_type,status,public_notes,
                   street_width,street_frontage_m,mehr_block,floor,mehr_unit,national_phase,
                   national_stage,national_notes,build_year,bedrooms,registration_month,latitude,longitude,
                   land_length_m,land_width_m,mehr_section,mehr_level,house_condition,floor_count)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id,public_code""",
                  (payload.public_code.strip(),payload.property_type_id,payload.region_id,
                   payload.neighborhood,payload.address,payload.area_m2,payload.building_area_m2,
                   payload.commercial_area_m2,payload.usage_type,payload.status,payload.notes,
                   payload.street_width,payload.street_frontage_m,payload.mehr_block,payload.mehr_floor,
                   payload.mehr_unit,payload.national_phase,payload.national_stage,payload.national_notes,
                   payload.build_year,payload.bedrooms,payload.registration_month,payload.latitude,payload.longitude,
                   payload.land_length_m,payload.land_width_m,payload.mehr_section,payload.mehr_level,
                   payload.house_condition,payload.floor_count)).fetchone()
                record = conn.execute("""INSERT INTO app.market_records
                  (property_id,record_month,property_type_id,region_id,region_name_snapshot,status,is_public)
                  VALUES (%s,CURRENT_DATE,%s,%s,%s,'verified',true) RETURNING id""",
                  (row['id'],payload.property_type_id,payload.region_id,region['name'])).fetchone()
                conn.execute("""INSERT INTO app.listings(market_record_id,asking_price_toman,status,is_public,published_at)
                  VALUES (%s,%s,'published',true,now())""",(record['id'],payload.asking_price_toman))
                conn.execute("INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id) VALUES (%s,'create','property',%s)",
                             (user['sub'],row['id']))
        return {"id":str(row['id']),"public_code":row['public_code'],"status":payload.status}
    except HTTPException:
        raise
    except Exception as exc:
        if getattr(exc, 'sqlstate', None) == '23505':
            raise HTTPException(409, "این کد ملک قبلاً ثبت شده است") from exc
        raise HTTPException(400, "ثبت ملک انجام نشد؛ اطلاعات را بررسی کنید") from exc

class PriceRangeIn(BaseModel):
    region_id: str
    property_type_id: str
    period: str = Field(min_length=5, max_length=20)
    low_price_toman: int = Field(gt=0)
    high_price_toman: int = Field(gt=0)

class EstimateIn(BaseModel):
    period: str = Field(pattern=r'^[0-9]{4}/(0[1-9]|1[0-2])$')
    segment: str
    region_key: str = 'all'
    value_toman: int = Field(gt=0)

class SaleIn(BaseModel):
    sale_date: str = Field(pattern=r'^[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])$')
    sale_price_toman: int = Field(gt=0)
    notes: str | None = None

@admin.put('/properties/{public_code}/sell')
def sell_property(public_code: str, payload: SaleIn, user=Depends(require_roles('owner','admin','data_entry'))):
    with pool.connection() as conn:
        with conn.transaction():
            row = conn.execute("SELECT id,status FROM app.properties WHERE public_code=%s FOR UPDATE", (public_code,)).fetchone()
            if not row:
                raise HTTPException(404, 'ملک پیدا نشد')
            if row['status'] != 'آگهی فروش':
                raise HTTPException(409, 'فقط آگهی فعال را می‌توان معامله‌شده ثبت کرد')
            listing = conn.execute("""UPDATE app.listings SET status='closed',is_public=false,closed_at=now()
              WHERE market_record_id IN (SELECT id FROM app.market_records WHERE property_id=%s)
                AND status='published' RETURNING id""", (row['id'],)).fetchone()
            if not listing:
                raise HTTPException(409, 'آگهی فعال برای این ملک پیدا نشد')
            conn.execute("UPDATE app.properties SET status='فروخته شده' WHERE id=%s", (row['id'],))
            conn.execute("""INSERT INTO app.property_sales(property_id,sale_date,sale_price_toman,notes)
              VALUES (%s,%s,%s,%s)""", (row['id'],payload.sale_date,payload.sale_price_toman,payload.notes))
            conn.execute("""INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
              VALUES (%s,'sell','property',%s)""", (user['sub'],row['id']))
    return {'public_code': public_code, 'status': 'فروخته شده'}

@admin.post('/monthly-estimates')
def save_estimate(payload: EstimateIn, user=Depends(require_roles('owner','admin'))):
    if payload.segment not in SEGMENTS or payload.segment.startswith('land_') and payload.region_key == 'all':
        raise HTTPException(422, 'گروه قیمت یا منطقه معتبر نیست')
    if not payload.segment.startswith('land_') and payload.region_key != 'all':
        raise HTTPException(422, 'برای زیربنا و مسکن مهر، منطقه باید کل اوز باشد')
    with pool.connection() as conn:
        if payload.region_key != 'all' and not conn.execute("SELECT 1 FROM app.regions WHERE slug=%s AND LEFT(slug, 2) = 'R-'", (payload.region_key,)).fetchone():
            raise HTTPException(422, 'منطقه معتبر نیست')
        row = conn.execute("""INSERT INTO app.monthly_price_estimates(period,segment,region_key,value_toman)
            VALUES (%s,%s,%s,%s) ON CONFLICT(period,segment,region_key)
            DO UPDATE SET value_toman=EXCLUDED.value_toman,updated_at=now() RETURNING id""",
            (payload.period,payload.segment,payload.region_key,payload.value_toman)).fetchone()
        conn.execute("""INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
          VALUES (%s,'save_estimate','monthly_price_estimate',%s)""", (user['sub'],row['id']))
        conn.commit()
    return {'id': str(row['id'])}

@admin.get('/monthly-estimates')
def list_estimates(user=Depends(require_roles('owner','admin'))):
    with pool.connection() as conn:
        rows = conn.execute("""SELECT period,segment,region_key,value_toman FROM app.monthly_price_estimates
              ORDER BY period DESC,segment,region_key LIMIT 200""").fetchall()
    return {'items': [dict(r) for r in rows]}

class PropertyLocationIn(BaseModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

@admin.put("/properties/{public_code}/location")
def update_property_location(public_code: str, payload: PropertyLocationIn,
                             user=Depends(require_roles("owner","admin","data_entry"))):
    if (payload.latitude is None) != (payload.longitude is None):
        raise HTTPException(422, "عرض و طول جغرافیایی باید با هم وارد شوند")
    with pool.connection() as conn:
        with conn.transaction():
            row = conn.execute("""UPDATE app.properties SET latitude=%s, longitude=%s
                                  WHERE public_code=%s RETURNING id,public_code""",
                               (payload.latitude,payload.longitude,public_code)).fetchone()
            if not row:
                raise HTTPException(404,"ملک پیدا نشد")
            conn.execute("""INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
                            VALUES (%s,'update_location','property',%s)""",
                         (user['sub'],row['id']))
    return {"public_code":row['public_code'],"latitude":payload.latitude,"longitude":payload.longitude}

@admin.post("/price-ranges")
def save_price_range(payload: PriceRangeIn, user=Depends(require_roles("owner","admin"))):
    if payload.high_price_toman < payload.low_price_toman:
        raise HTTPException(422,"حد بالا باید از حد پایین بیشتر باشد")
    with pool.connection() as conn:
        row=conn.execute("""INSERT INTO app.manual_price_ranges(region_id,property_type_id,period,low_price_toman,high_price_toman)
           VALUES (%s,%s,%s,%s,%s) ON CONFLICT(region_id,property_type_id,period) DO UPDATE SET
           low_price_toman=EXCLUDED.low_price_toman,high_price_toman=EXCLUDED.high_price_toman RETURNING id""",
           (payload.region_id,payload.property_type_id,payload.period,payload.low_price_toman,payload.high_price_toman)).fetchone()
        conn.commit()
    return {"id":str(row['id'])}

@admin.get("/properties/direct")
def list_direct_properties(user=Depends(require_roles("owner","admin","data_entry","analyst","editor","viewer"))):
    with pool.connection() as conn:
        rows=conn.execute("""SELECT p.public_code,p.status,p.registration_month,p.area_m2,p.private_address,
          p.latitude,p.longitude,
          t.name AS property_type,r.name AS region,l.asking_price_toman,s.sale_date,s.sale_price_toman
          FROM app.properties p JOIN app.property_types t ON t.id=p.property_type_id
          LEFT JOIN app.regions r ON r.id=p.region_id
          LEFT JOIN LATERAL (SELECT l.asking_price_toman FROM app.listings l
            JOIN app.market_records m ON m.id=l.market_record_id WHERE m.property_id=p.id
            ORDER BY l.published_at DESC NULLS LAST LIMIT 1) l ON true
          LEFT JOIN app.property_sales s ON s.property_id=p.id
          ORDER BY p.created_at DESC LIMIT 100""").fetchall()
    return {"items":[dict(row) for row in rows]}


app.include_router(public); app.include_router(admin)
