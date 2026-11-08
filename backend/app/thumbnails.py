"""Bounded in-memory image variants. Publication is checked even on cache hits."""
from functools import lru_cache
import hashlib
from io import BytesIO
from pathlib import Path
from threading import BoundedSemaphore
import re
from fastapi import APIRouter,HTTPException,Request
from fastapi.responses import Response
from PIL import Image,ImageOps,UnidentifiedImageError
from . import launch,media_storage
router=APIRouter()
workers=BoundedSemaphore(2)
MAX_SOURCE=16*1024*1024
FILENAME=re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)')

@lru_cache(maxsize=128)
def thumbnail_bytes(filename):
    if not workers.acquire(timeout=2):raise HTTPException(503,'تصویر کوچک موقتاً آماده نیست',headers={'Retry-After':'2'})
    try:
        if media_storage.mode()=='s3':
            result=media_storage.get_file(filename)
            body=result['Body']
            try:
                if result.get('ContentLength',0)>MAX_SOURCE:raise HTTPException(413,'عکس بیش از حد بزرگ است')
                data=body.read(MAX_SOURCE+1)
            finally:body.close()
        elif media_storage.mode()=='local':
            path=launch.MEDIA_ROOT/filename
            if path.is_symlink() or not path.is_file():raise HTTPException(404)
            with path.open('rb') as file:data=file.read(MAX_SOURCE+1)
        else:raise HTTPException(503,'فضای فایل تنظیم نشده است')
        if len(data)>MAX_SOURCE:raise HTTPException(413,'عکس بیش از حد بزرگ است')
        try:
            with Image.open(BytesIO(data)) as source:
                if source.width*source.height>40000000:raise HTTPException(413,'ابعاد عکس بیش از حد بزرگ است')
                image=ImageOps.exif_transpose(source)
                image.thumbnail((640,480))
                output=BytesIO();image.convert('RGBA' if 'A' in image.getbands() else 'RGB').save(output,format='WEBP',quality=76,exif=b'')
                return output.getvalue()
        except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError):raise HTTPException(422,'عکس معتبر نیست') from None
    finally:workers.release()

@router.api_route('/api/public/media/{filename}/thumbnail',methods=['GET','HEAD'])
def public_thumbnail(filename:str,request:Request):
    if not FILENAME.fullmatch(filename) or not launch.public_media_allowed(filename):raise HTTPException(404,headers={'Cache-Control':'no-store'})
    data=thumbnail_bytes(filename)
    headers={'Cache-Control':'public,max-age=0,must-revalidate','X-Content-Type-Options':'nosniff','ETag':'\"'+hashlib.sha256(data).hexdigest()+'\"'}
    if request.headers.get('if-none-match')==headers['ETag']:return Response(status_code=304,headers=headers)
    headers['Content-Length']=str(len(data))
    return Response(content=None if request.method=='HEAD' else data,media_type='image/webp',headers=headers)
