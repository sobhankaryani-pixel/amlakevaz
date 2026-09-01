from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Depends
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

@app.get("/health", tags=["system"])
def health(): return {"status": "ok", "service": "evaz-property-index-api"}

@public.get("/indices")
def public_indices(): return {"items": [], "message": "Published indices will appear here."}

@public.get("/transactions")
def public_transactions(): return {"items": [], "message": "Only verified public transactions are returned."}

@admin.get("/me")
def admin_me(user=Depends(require_roles("owner","admin","data_entry","analyst","editor","viewer"))): return user

app.include_router(public); app.include_router(admin)
