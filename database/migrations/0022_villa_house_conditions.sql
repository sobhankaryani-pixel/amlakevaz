BEGIN;
ALTER TABLE app.properties DROP CONSTRAINT IF EXISTS properties_house_condition_check;
ALTER TABLE app.properties ADD CONSTRAINT properties_house_condition_check
  CHECK (house_condition IN ('نوساز', 'کلنگی', 'نیمه‌کاره', 'چند سال ساخت'));
COMMIT;
