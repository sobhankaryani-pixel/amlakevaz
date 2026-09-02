-- داده‌های مرجع اولیه؛ فقط یک‌بار در Supabase اجرا شود.
INSERT INTO app.regions (name, slug, is_public) VALUES ('اوز','evaz',true) ON CONFLICT (slug) DO NOTHING;
INSERT INTO app.property_types (code, name, category) VALUES
 ('apartment','آپارتمان','مسکونی'),('villa','ویلایی','مسکونی'),('land','زمین','ملکی'),('commercial','تجاری','تجاری')
 ON CONFLICT (code) DO NOTHING;
