-- Retain earlier unsplit Mehr prices as historical data; new prices are stored separately.
ALTER TABLE app.monthly_price_estimates
  DROP CONSTRAINT IF EXISTS monthly_price_estimates_segment_check;
ALTER TABLE app.monthly_price_estimates
  ADD CONSTRAINT monthly_price_estimates_segment_check
  CHECK (segment IN ('land_residential','land_commercial','house_new','apartment',
                    'mehr','mehr_upper','mehr_lower'));
