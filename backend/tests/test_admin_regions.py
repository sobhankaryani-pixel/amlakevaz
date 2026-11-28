from backend.tests.test_agency_integration import must, system


def test_admin_can_add_a_region_to_the_existing_lists(system):
    client, _, owner, _ = system
    path = "/api/admin/regions"
    assert client.post(path, json={"name": "محله نو"}).status_code == 401
    assert client.post(path, headers=owner, json={"name": "   "}).status_code == 400

    region = must(client.post(path, headers=owner, json={"name": "  شهرک   نو  "}), 201)
    assert region["name"] == "شهرک نو"
    assert region["slug"].startswith("R-")
    assert region in must(client.get("/api/admin/reference", headers=owner))["regions"]
    assert {"name": region["name"], "slug": region["slug"]} in must(
        client.get("/api/public/submission-regions")
    )["items"]
    assert client.post(path, headers=owner, json={"name": "شهرك‌نو"}).status_code == 409


def test_sample_rotation_is_persisted_and_does_not_replace_an_uploaded_photo(system):
    client, db, owner, _ = system
    with db.connection() as conn:
        conn.execute("""
            INSERT INTO app.properties (public_code, property_type_id, region_id, area_m2, status, public_notes)
            SELECT 'SAMPLE-QA', t.id, r.id, 200, 'آگهی فروش', 'زمین دو‌بر'
            FROM app.property_types t CROSS JOIN app.regions r WHERE t.code='raw_land' AND r.slug='R-QA'
        """)
        conn.execute("""
            WITH record AS (
                INSERT INTO app.market_records (property_id, record_month, property_type_id, region_id, region_name_snapshot, status)
                SELECT id, '2026-11-01', property_type_id, region_id, 'منطقه آزمایشی', 'published'
                FROM app.properties WHERE public_code='SAMPLE-QA' RETURNING id
            )
            INSERT INTO app.listings (market_record_id, asking_price_toman, status, is_public, published_at)
            SELECT id, 5000000000, 'published', true, now() FROM record
        """)
        conn.commit()

    path = "/api/admin/properties/SAMPLE-QA/sample-photo"
    assert client.post(path).status_code == 401
    assert must(client.post(path, headers=owner))["sample_photo_index"] == 1
    admin_item = must(client.get("/api/admin/properties/direct", headers=owner))["items"][0]
    public_item = must(client.get("/api/public/property-cards"))["items"][0]
    for item in (admin_item, public_item):
        assert item["sample_photo_index"] == 1
        assert item["sample_land_fronts"] == 2
    assert must(client.get("/api/public/properties/SAMPLE-QA"))["item"]["sample_photo_index"] == 1

    with db.connection() as conn:
        conn.execute("""
            UPDATE app.properties SET media='[{"kind":"image","url":"https://example.invalid/listing.webp"}]'
            WHERE public_code='SAMPLE-QA'
        """)
        conn.commit()
    assert client.post(path, headers=owner).status_code == 409
