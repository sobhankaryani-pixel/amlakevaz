ALTER TABLE app.properties
 ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
 ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
 ADD CONSTRAINT properties_map_coordinates_check CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (latitude IS NOT NULL AND longitude IS NOT NULL AND
   latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
 );
CREATE INDEX IF NOT EXISTS properties_map_location_idx ON app.properties(latitude,longitude)
 WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
