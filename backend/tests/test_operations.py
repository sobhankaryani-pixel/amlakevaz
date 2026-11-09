import os
os.environ.setdefault("DATABASE_URL","postgresql://test:test@127.0.0.1/test")
os.environ.setdefault("JWT_SECRET","test-secret-only")
import base64,importlib.util,sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest,yaml
from fastapi import HTTPException
from backend.app import admin_mfa,launch
SECRET=bytes(range(20))

def test_totp_rfc6238_vector():
 assert admin_mfa.code_for(b'12345678901234567890',59//30)=='287082'

def test_totp_optional_required_invalid_and_replay(monkeypatch):
 user={'id':'isolated-user','role':'owner'}
 monkeypatch.delenv('ADMIN_TOTP_SECRETS',raising=False)
 admin_mfa.verify_admin_mfa('qa',user,'')
 monkeypatch.setenv('ADMIN_TOTP_SECRETS','{"qa":"'+base64.b32encode(SECRET).decode()+'"}')
 for code in ('','123','abcdef','000000'):
  with pytest.raises(HTTPException) as err:admin_mfa.verify_admin_mfa('qa',user,code,now=30000)
  assert err.value.status_code==401
 db=MagicMock();conn=db.connection.return_value.__enter__.return_value
 conn.execute.return_value.fetchone.side_effect=[{'key':'isolated'},None]
 monkeypatch.setattr(admin_mfa,'pool',db)
 code=admin_mfa.code_for(SECRET,1000)
 admin_mfa.verify_admin_mfa('qa',user,code,now=30000)
 with pytest.raises(HTTPException):admin_mfa.verify_admin_mfa('qa',user,code,now=30000)
 assert conn.commit.call_count==2
 assert SECRET.hex() not in str(conn.execute.call_args)

def test_mfa_bad_configuration_fails_closed(monkeypatch):
 for value in ('[]','not-json','{"qa":"bad"}'):
  monkeypatch.setenv('ADMIN_TOTP_SECRETS',value)
  with pytest.raises(HTTPException) as err:admin_mfa.verify_admin_mfa('qa',{'id':'x','role':'admin'},'')
  assert err.value.status_code==503

def test_rehearsal_targets_are_strictly_isolated():
 sys.path.insert(0,str(Path('backend/scripts').resolve()))
 from recovery_rehearsal import validate_target,BackupError
 source='postgresql://x:x@production/app'
 for target in ('postgresql://x:x@production/app','postgresql://x:x@production/evaz_restore_test','postgresql://x:x@localhost/app'):
  with pytest.raises(BackupError):validate_target(source,target)
 assert validate_target(source,'postgresql://x:x@restore-db/evaz_restore_test')['PGDATABASE']=='evaz_restore_test'
 with pytest.raises(BackupError):validate_target('postgresql://x:x@localhost/evaz_restore_test','postgresql://x:x@localhost/evaz_restore_test')

@pytest.mark.parametrize('brand',[b'heic',b'heix',b'avif',b'mif1'])
def test_iphone_still_images_are_not_video(brand):
 with pytest.raises(HTTPException) as err:launch.file_kind(b'\x00\x00\x00\x18ftyp'+brand+b'\x00'*4+brand)
 assert err.value.status_code==422

def test_workflows_parse_and_alerts_execute_no_repository_code():
 for path in Path('.github/workflows').glob('*.yml'):assert isinstance(yaml.safe_load(path.read_text()),dict)
 alert=Path('.github/workflows/operations-alerts.yml').read_text()
 assert 'actions/checkout' not in alert and 'download-artifact' not in alert
 assert 'head_repository' in alert and "head_branch!=='main'" in alert
