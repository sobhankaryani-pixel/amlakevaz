BEGIN;
-- Rename the existing type in place: listing IDs, type codes and relations stay intact.
UPDATE app.property_types SET name='زمین' WHERE code IN ('raw_land','land');
COMMIT;
