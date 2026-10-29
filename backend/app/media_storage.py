"""Private S3-compatible media storage. Credentials never reach the browser."""
import os
from functools import lru_cache
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException


def mode():
    return os.getenv('MEDIA_STORAGE', 'local').strip().lower()


def configuration():
    endpoint = os.getenv('S3_ENDPOINT_URL', '').strip().rstrip('/')
    bucket = os.getenv('S3_BUCKET', '').strip()
    access = os.getenv('S3_ACCESS_KEY_ID', '').strip()
    secret = os.getenv('S3_SECRET_ACCESS_KEY', '').strip()
    # Standard S3 signing default; override if the provider requires a region.
    region = os.getenv('S3_REGION', 'us-east-1').strip() or 'us-east-1'
    url = urlsplit(endpoint)
    if not (url.scheme == 'https' and url.hostname and not url.username and not url.password
            and url.path in ('', '/') and not url.query and not url.fragment
            and bucket and access and secret):
        raise HTTPException(503, 'تنظیمات فضای ابری کامل نیست؛ پنج متغیر اتصال آروان را در Render بررسی کنید')
    return endpoint, bucket, access, secret, region


def configured():
    if mode() == 'local':
        return bool(os.getenv('MEDIA_DIR'))
    if mode() != 's3':
        return False
    try:
        configuration()
        return True
    except HTTPException:
        return False


@lru_cache(maxsize=1)
def _client(endpoint, access, secret, region):
    return boto3.client('s3', endpoint_url=endpoint, aws_access_key_id=access,
                        aws_secret_access_key=secret, region_name=region,
                        config=Config(signature_version='s3v4',
                                      s3={'addressing_style': 'path'},
                                      request_checksum_calculation='when_required',
                                      response_checksum_validation='when_required',
                                      connect_timeout=10, read_timeout=60,
                                      retries={'mode': 'standard', 'total_max_attempts': 3}))


def connection():
    endpoint, bucket, access, secret, region = configuration()
    return _client(endpoint, access, secret, region), bucket


def storage_error(error):
    """Safe user messages: SDK errors may contain internal URLs/credential identifiers."""
    code = error.response.get('Error', {}).get('Code', '') if isinstance(error, ClientError) else ''
    if code in ('NoSuchKey', '404', 'NotFound'):
        return HTTPException(404, 'فایل پیدا نشد')
    if code in ('InvalidRange', '416'):
        return HTTPException(416, 'بازهٔ درخواستی فایل معتبر نیست')
    if code in ('AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', '403'):
        return HTTPException(503, 'دسترسی به فضای آروان تأیید نشد؛ کلیدها و دسترسی صندوقچه را بررسی کنید')
    if code == 'NoSuchBucket':
        return HTTPException(503, 'صندوقچهٔ آروان پیدا نشد؛ نام صندوقچه و آدرس اتصال را بررسی کنید')
    return HTTPException(503, 'ارتباط با فضای آروان برقرار نشد؛ دوباره تلاش کنید')


STORAGE_ERRORS = (BotoCoreError, ClientError)


def put_file(path, filename, mime):
    client, bucket = connection()
    try:
        # Single PUT: files are limited to 50 MiB; no abandoned multipart uploads.
        with path.open('rb') as body:
            client.put_object(Bucket=bucket, Key=filename, Body=body,
                              ContentLength=path.stat().st_size, ContentType=mime,
                              CacheControl='public,max-age=31536000,immutable')
    except STORAGE_ERRORS as error:
        raise storage_error(error) from None


def delete_file(filename):
    client, bucket = connection()
    client.delete_object(Bucket=bucket, Key=filename)


def get_file(filename, byte_range=None, head=False):
    client, bucket = connection()
    params = {'Bucket': bucket, 'Key': filename}
    if byte_range:
        params['Range'] = byte_range
    try:
        return (client.head_object if head else client.get_object)(**params)
    except STORAGE_ERRORS as error:
        raise storage_error(error) from None
