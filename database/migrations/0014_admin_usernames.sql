-- Run once before deploying the username/admin-management backend.
BEGIN;
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE app.users ALTER COLUMN email DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci_unique ON app.users (lower(username)) WHERE username IS NOT NULL;
COMMIT;

-- Existing accounts keep their password and can still sign in with their email.
-- The owner can assign their own username from «مدیریت ادمین‌ها» after signing in.
