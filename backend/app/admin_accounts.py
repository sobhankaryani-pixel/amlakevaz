"""Owner-only administrator management. Seller/agency accounts are separate."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from psycopg.errors import UniqueViolation
from .auth import require_roles, hash_password
from .db import pool

admin_accounts = APIRouter(prefix='/api/admin/accounts', tags=['admin accounts'])
owner_only = Depends(require_roles('owner'))
ASSIGNABLE_ROLES = {'admin', 'data_entry', 'analyst', 'editor', 'viewer'}
PUBLIC_FIELDS = 'id,username,email,role,is_active,created_at'


class AdminCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]{2,39}$')
    password: str = Field(min_length=10, max_length=128)
    role: str = 'admin'


class AdminUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=40, pattern=r'^[A-Za-z0-9][A-Za-z0-9_.-]{2,39}$')
    password: str | None = Field(default=None, min_length=10, max_length=128)
    role: str | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def nonempty(self):
        if not self.model_dump(exclude_none=True):
            raise ValueError('حداقل یک تغییر وارد کنید.')
        return self


@admin_accounts.get('')
def list_accounts(user=owner_only):
    with pool.connection() as conn:
        rows = conn.execute(f'SELECT {PUBLIC_FIELDS} FROM app.users ORDER BY created_at,id').fetchall()
    return {'items': [dict(row) for row in rows]}


@admin_accounts.post('', status_code=201)
def create_account(payload: AdminCreate, user=owner_only):
    if payload.role not in ASSIGNABLE_ROLES:
        raise HTTPException(422, 'نقش انتخاب‌شده معتبر نیست.')
    encoded_password = hash_password(payload.password)
    try:
        with pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(f'''INSERT INTO app.users(username,password_hash,role)
                    VALUES (%s,%s,%s) RETURNING {PUBLIC_FIELDS}''',
                    (payload.username.lower(), encoded_password, payload.role)).fetchone()
                conn.execute('''INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
                    VALUES (%s,'create_admin','user',%s)''', (user['sub'], row['id']))
    except UniqueViolation as exc:
        raise HTTPException(409, 'این نام کاربری قبلاً ثبت شده است.') from exc
    return {'item': dict(row)}


@admin_accounts.put('/{account_id}')
def update_account(account_id: UUID, payload: AdminUpdate, user=owner_only):
    if payload.role is not None and payload.role not in ASSIGNABLE_ROLES:
        raise HTTPException(422, 'نقش انتخاب‌شده معتبر نیست.')
    try:
        with pool.connection() as conn:
            with conn.transaction():
                target = conn.execute('SELECT id,role FROM app.users WHERE id=%s FOR UPDATE', (account_id,)).fetchone()
                if not target:
                    raise HTTPException(404, 'حساب پیدا نشد.')
                if target['role'] == 'owner':
                    if str(target['id']) != user['sub'] or payload.role is not None or payload.is_active is not None:
                        raise HTTPException(403, 'حساب مالک اصلی قابل غیرفعال‌سازی یا تغییر نقش نیست.')
                changes = payload.model_dump(exclude_none=True)
                assignments, values = [], []
                for key, value in changes.items():
                    if key == 'password':
                        assignments.append('password_hash=%s')
                        values.append(hash_password(value))
                    else:
                        # Column names come only from the validated model above.
                        assignments.append(key + '=%s')
                        values.append(value.lower() if key == 'username' else value)
                assignments.append('session_version=session_version+1')
                values.append(account_id)
                row = conn.execute(f'UPDATE app.users SET {",".join(assignments)} WHERE id=%s RETURNING {PUBLIC_FIELDS}', tuple(values)).fetchone()
                # Never log either the plain password or its hash in audit records.
                conn.execute('''INSERT INTO app.audit_logs(user_id,action,entity_type,entity_id)
                    VALUES (%s,'update_admin','user',%s)''', (user['sub'], account_id))
    except UniqueViolation as exc:
        raise HTTPException(409, 'این نام کاربری قبلاً ثبت شده است.') from exc
    return {'item': dict(row), 'sign_in_again': str(account_id) == user['sub']}
