from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .db import open_pool, close_pool
from .auth import require_roles

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

@app.get("/health", tags=["system"])
def health(): return {"status": "ok", "service": "evaz-property-index-api"}

@public.get("/indices")
def public_indices(): return {"items": [], "message": "Published indices will appear here."}

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

app.include_router(public); app.include_router(admin)
