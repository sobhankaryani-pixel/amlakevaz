"""Offline routing/escaping tests; no production database, storage or network."""
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

# Load SEO in isolation so the test cannot initialize the production DB pool.
PACKAGE = '_evaz_seo_tests'
pkg = types.ModuleType(PACKAGE)
pkg.__path__ = []
launch = types.ModuleType(PACKAGE + '.launch')
launch.public_property = lambda code: None
launch.sitemap_data = lambda: None
sys.modules[PACKAGE] = pkg
sys.modules[PACKAGE + '.launch'] = launch
spec = importlib.util.spec_from_file_location(PACKAGE + '.seo', Path(__file__).parents[1] / 'app/seo.py')
seo = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = seo
spec.loader.exec_module(seo)
app = FastAPI()
app.include_router(seo.router)
client = TestClient(app)
SHELL = '<html><head><title>old</title><meta name="description" content="old"><link rel="canonical" href="old"><script type="module" src="/assets/current.js"></script></head><body><div id="root"></div></body></html>'
ITEM = {'public_code': '01', 'property_type': 'زمین', 'neighborhood': '<script>alert(1)</script>', 'asking_price_toman': 6600000000, 'public_notes': '</p><script>bad()</script>', 'media': [{'kind': 'image', 'url': 'https://api.evazmelk.ir/api/public/media/photo.webp'}], 'updated_at': '2026-11-04T12:00:00Z'}

class SEOTests(unittest.TestCase):
    def test_listing_metadata_and_escaped_fallback(self):
        with patch.object(seo, 'public_property', return_value={'item': ITEM}), patch.object(seo, 'shell_html', return_value=SHELL):
            result = client.get('/api/public/seo/properties/01')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.text.count('<title>'), 1)
        self.assertIn('https://evazmelk.ir/properties/01', result.text)
        self.assertIn('https://api.evazmelk.ir/api/public/media/photo.webp', result.text)
        self.assertIn('/assets/current.js', result.text)
        self.assertNotIn('<script>bad()', result.text)
        self.assertNotIn('<script>alert(1)', result.text)
        data = result.text.split('type="application/ld+json">')[1].split('</script>')[0]
        self.assertEqual(json.loads(data)['offers']['price'], 66000000000)

    def test_unpublished_listing_is_nonindexable_404(self):
        with patch.object(seo, 'public_property', side_effect=HTTPException(404)), patch.object(seo, 'shell_html', return_value=SHELL):
            result = client.get('/api/public/seo/properties/unknown')
        self.assertEqual(result.status_code, 404)
        self.assertIn('noindex,follow', result.text)
        self.assertNotIn('application/ld+json', result.text)

    def test_database_failure_is_retryable(self):
        with patch.object(seo, 'public_property', side_effect=RuntimeError()), patch.object(seo, 'shell_html', return_value=SHELL):
            result = client.get('/api/public/seo/properties/01')
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.headers['retry-after'], '60')

    def test_shell_failure_is_not_empty_success(self):
        with patch.object(seo, 'public_property', return_value={'item': ITEM}), patch.object(seo, 'shell_html', side_effect=TimeoutError()):
            result = client.get('/api/public/seo/properties/01')
        self.assertEqual(result.status_code, 503)
        self.assertIn('noindex', result.text)

    def test_sitemap_is_live_and_excludes_panels(self):
        with patch.object(seo, 'sitemap_data', return_value={'items': [ITEM]}):
            result = client.get('/api/public/seo/sitemap.xml')
        self.assertEqual(result.status_code, 200)
        ElementTree.fromstring(result.text)
        self.assertIn('/properties/01', result.text)
        self.assertNotIn('/management', result.text)
        self.assertNotIn('/agency', result.text)
        with patch.object(seo, 'sitemap_data', return_value={'items': []}):
            self.assertNotIn('/properties/01', client.get('/api/public/seo/sitemap.xml').text)

    def test_sitemap_failure_does_not_publish_incomplete_xml(self):
        with patch.object(seo, 'sitemap_data', side_effect=RuntimeError()):
            self.assertEqual(client.get('/api/public/seo/sitemap.xml').status_code, 503)

if __name__ == '__main__':
    unittest.main()
