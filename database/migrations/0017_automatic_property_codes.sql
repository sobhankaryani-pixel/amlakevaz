BEGIN;
CREATE SEQUENCE IF NOT EXISTS app.property_public_code_seq START 1;
CREATE TABLE IF NOT EXISTS app.property_code_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid UNIQUE NOT NULL,
 owner_id uuid NOT NULL,public_code text UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),consumed_at timestamptz,
 property_id uuid,request_hash text
);
-- Preserve every existing URL, including 01. Never rewind an allocated number.
DO $$ DECLARE highest bigint; previous bigint; used boolean; BEGIN
 SELECT COALESCE(max(public_code::bigint),0) INTO highest FROM (
  SELECT public_code FROM app.properties UNION ALL SELECT public_code FROM app.property_code_reservations
 ) p WHERE public_code ~ '^[0-9]{1,15}$';
 SELECT last_value,is_called INTO previous,used FROM app.property_public_code_seq;
 highest=GREATEST(highest,CASE WHEN used THEN previous ELSE 0 END);
 IF highest>0 THEN PERFORM setval('app.property_public_code_seq',highest,true);
 ELSE PERFORM setval('app.property_public_code_seq',1,false); END IF;
END $$;
CREATE OR REPLACE FUNCTION app.allocate_property_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE result text; number text; BEGIN
 LOOP
  number=nextval('app.property_public_code_seq')::text;
  result=lpad(number,GREATEST(2,length(number)),'0');
  IF NOT EXISTS(SELECT 1 FROM app.properties WHERE public_code=result)
   AND NOT EXISTS(SELECT 1 FROM app.property_code_reservations WHERE public_code=result) THEN RETURN result; END IF;
 END LOOP;
END $$;
COMMIT;
