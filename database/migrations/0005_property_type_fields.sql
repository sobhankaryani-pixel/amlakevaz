-- Additive migration for property-specific entry fields. Existing properties are retained.
ALTER TABLE app.properties
 ADD COLUMN IF NOT EXISTS land_length_m numeric(10,2) CHECK (land_length_m > 0),
 ADD COLUMN IF NOT EXISTS land_width_m numeric(10,2) CHECK (land_width_m > 0),
 ADD COLUMN IF NOT EXISTS mehr_section text CHECK (mehr_section IN ('محلی','فرهنگیان')),
 ADD COLUMN IF NOT EXISTS mehr_level text CHECK (mehr_level IN ('بالا','پایین')),
 ADD COLUMN IF NOT EXISTS house_condition text CHECK (house_condition IN ('نوساز','کلنگی')),
 ADD COLUMN IF NOT EXISTS floor_count integer CHECK (floor_count > 0);
