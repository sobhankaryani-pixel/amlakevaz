ALTER TABLE app.properties
    ADD COLUMN IF NOT EXISTS sample_photo_index integer NOT NULL DEFAULT 0;
