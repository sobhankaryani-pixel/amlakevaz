-- Optional public cover photo URL for a property listing.
-- Existing records and charts remain unchanged.
ALTER TABLE app.properties ADD COLUMN IF NOT EXISTS cover_photo_url text;
