BEGIN;
ALTER TABLE app.customer_contacts ADD COLUMN IF NOT EXISTS residence_city text
 CHECK (residence_city IN ('اوز','کهنه','کهنه جدید','قلات','اسلام آباد','گلار','کوره','بیدشهر','هود','هیرم','فیشور','محلچه','گراش','لار'));
COMMIT;
