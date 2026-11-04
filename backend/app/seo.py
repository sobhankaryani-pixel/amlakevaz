"""Public SEO on Liara. Uses only the existing public listing queries.

The SPA shell is a static file on the existing web app; it is never a user URL.
No cookies, tokens, private fields or request headers are forwarded to it.
"""
import json
import re
from datetime import datetime
from html import escape
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException
from starlette.responses import Response
from .launch import public_property, sitemap_data

router = APIRouter(prefix='/api/public/seo', tags=['public-seo'])
SITE = 'https://evazmelk.ir'
SHELL_URL = 'https://evazmelk-web.liara.run/seo-shell.html'
DEFAULT_IMAGE = SITE + '/brand/favicon-emblem-v3-256.png'
# Public routes only; login, seller accounts and management are excluded.
PAGES = ('/', '/search', '/map', '/index', '/areas', '/about', '/contact')


def iso_date(value):
    if not value:
        return None
    try:
        date = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return date.isoformat()
    except (ValueError, TypeError):
        return None


def shell_html():
    req = Request(SHELL_URL, headers={'User-Agent': 'Evazmelk-Liara-SEO/1.0'})
    with urlopen(req, timeout=6) as result:
        if result.status != 200 or 'text/html' not in result.headers.get('Content-Type', ''):
            raise ValueError('invalid_shell_response')
        body = result.read(1024 * 1024 + 1)
    if len(body) > 1024 * 1024:
        raise ValueError('shell_too_large')
    text = body.decode('utf-8')
    if 'id="root"' not in text or '</head>' not in text:
        raise ValueError('invalid_shell')
    return text


def property_metadata(item):
    code = str(item['public_code'])
    kind = str(item['property_type'])
    place = str(item.get('neighborhood') or item.get('region') or 'اوز')
    title = f'{kind} در {place} | کد {code} | املاک خودمونی'
    price = int(item.get('asking_price_toman') or 0)
    fa_price = format(price, ',').translate(str.maketrans('0123456789,', '۰۱۲۳۴۵۶۷۸۹٬'))
    description = f'{kind} در {place}؛ قیمت {fa_price} تومان. کد ملک {code}. تماس با املاک خودمونی: 09212745755'
    image = DEFAULT_IMAGE
    candidates = [item.get('cover_photo_url')] + [m.get('url') for m in (item.get('media') or []) if m.get('kind') == 'image']
    for candidate in candidates:
        if not isinstance(candidate, str):
            continue
        if candidate.startswith('/') and not candidate.startswith('//'):
            candidate = SITE + candidate
        parsed = urlsplit(candidate)
        if parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password:
            image = candidate
            break
    url = SITE + '/properties/' + quote(code, safe='')
    structured = {'@context': 'https://schema.org', '@type': 'RealEstateListing',
                  'name': title, 'description': description, 'url': url, 'image': image}
    for field, source in [('dateModified', 'updated_at'), ('datePosted', 'published_at')]:
        value = iso_date(item.get(source))
        if value:
            structured[field] = value
    if price > 0:
        structured['offers'] = {'@type': 'Offer', 'price': price * 10, 'priceCurrency': 'IRR'}
    return {'title': title, 'description': description, 'url': url, 'image': image,
            'robots': 'index,follow', 'structured': structured}


def inject_metadata(html, metadata):
    tags = [('name', 'description', metadata['description']), ('name', 'robots', metadata['robots']),
            ('property', 'og:type', 'website'), ('property', 'og:locale', 'fa_IR'),
            ('property', 'og:site_name', 'املاک خودمونی اوز')]
    for key in ('title', 'description', 'url', 'image'):
        tags.append(('property', 'og:' + key, metadata[key]))
    tags += [('property', 'og:image:alt', metadata['title']), ('name', 'twitter:card', 'summary_large_image')]
    for key in ('title', 'description', 'image'):
        tags.append(('name', 'twitter:' + key, metadata[key]))
    tags.append(('name', 'twitter:image:alt', metadata['title']))
    keys = {key for _, key, _ in tags}
    def keep_meta(match):
        found = re.search(r'\b(?:name|property)\s*=\s*[\"\']([^\"\']+)', match[0], re.I)
        return '' if found and found[1].lower() in keys else match[0]
    html = re.sub(r'<title\b[^>]*>.*?</title>', '', html, flags=re.I | re.S)
    html = re.sub(r'<meta\b[^>]*>', keep_meta, html, flags=re.I)
    html = re.sub(r'<link\b[^>]*>', lambda m: '' if re.search(r'\brel\s*=\s*[\"\']canonical[\"\']', m[0], re.I) else m[0], html, flags=re.I)
    html = re.sub(r'<script\b[^>]*id=[\"\']evaz-property-jsonld[\"\'][^>]*>.*?</script>', '', html, flags=re.I | re.S)
    output = '<title>' + escape(metadata['title']) + '</title>'
    output += ''.join(f'<meta {attr}="{key}" content="{escape(str(value), quote=True)}">' for attr, key, value in tags)
    output += '<link rel="canonical" href="' + escape(metadata['url'], quote=True) + '">'
    if metadata.get('structured'):
        data = json.dumps(metadata['structured'], ensure_ascii=False).replace('<', '\\u003c')
        output += '<script id="evaz-property-jsonld" type="application/ld+json">' + data + '</script>'
    return re.sub(r'</head>', lambda _: output + '</head>', html, count=1, flags=re.I)


@router.get('/sitemap.xml')
def sitemap():
    try:
        items = sitemap_data()['items']
        entries = [(SITE + path, None) for path in PAGES]
        entries += [(SITE + '/properties/' + quote(str(item['public_code']), safe=''), iso_date(item.get('updated_at'))) for item in items]
        xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        for url, updated in entries:
            xml += '<url><loc>' + escape(url) + '</loc>'
            if updated:
                xml += '<lastmod>' + escape(updated) + '</lastmod>'
            xml += '</url>'
        xml += '</urlset>'
        return Response(xml, media_type='application/xml', headers={'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff'})
    except Exception:
        return Response('Sitemap temporarily unavailable', status_code=503, headers={'Retry-After': '60', 'Cache-Control': 'no-store'})


@router.get('/properties/{code:path}')
def property_page(code: str):
    status, item = 200, None
    metadata = {'title': 'آگهی موجود نیست | املاک خودمونی اوز',
                'description': 'این آگهی موجود نیست یا دیگر فعال نیست.',
                'url': SITE + '/properties/' + quote(code, safe=''), 'image': DEFAULT_IMAGE,
                'robots': 'noindex,follow', 'structured': None}
    try:
        if not code or len(code) > 80 or '/' in code:
            raise HTTPException(404)
        item = public_property(code)['item']
        metadata = property_metadata(item)
    except HTTPException as error:
        status = 404 if error.status_code == 404 else 503
    except Exception:
        status = 503
    if status == 503:
        item = None
        metadata.update(title='دریافت آگهی موقتاً ممکن نیست | املاک خودمونی اوز', description='دریافت آگهی موقتاً امکان‌پذیر نیست؛ دوباره تلاش کنید.')
    try:
        html = inject_metadata(shell_html(), metadata)
        if item:
            article = '<article dir="rtl"><h1>' + escape(metadata['title']) + '</h1><p>' + escape(metadata['description']) + '</p><p>' + escape(str(item.get('public_notes') or '')) + '</p></article>'
            html = html.replace('<div id="root"></div>', '<div id="root">' + article + '</div>')
    except Exception:
        # Fail visibly and retryably; never return an indexable empty 200 page.
        status = 503
        html = '<!doctype html><html lang="fa" dir="rtl"><head><meta name="robots" content="noindex,follow"><meta charset="utf-8"></head><body>دریافت صفحه موقتاً ممکن نیست؛ دوباره تلاش کنید.</body></html>'
    headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin'}
    if status == 503:
        headers['Retry-After'] = '60'
    return Response(html, status_code=status, media_type='text/html', headers=headers)
