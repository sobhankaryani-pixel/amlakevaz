"""Durable outbox in existing audit log. No personal seller data enters SMS."""
import asyncio,logging
from psycopg.types.json import Jsonb
from .db import pool
from .sms_gateway import owner_notification_configured,send_owner_submission_notice

def enqueue(conn,submission_id,revision=0):
    from .manager_notifications import enqueue as manager_enqueue
    manager_enqueue(conn,'property',submission_id,key='property:'+str(submission_id)+':'+str(revision))
    conn.execute("INSERT INTO app.audit_logs(action,entity_type,entity_id,after_data) VALUES ('owner_sms_pending','owner_notification',%s,%s)",(submission_id,Jsonb({'revision':revision})))

def process_one():
    if not owner_notification_configured():return False
    with pool.connection() as conn:
        with conn.transaction():
            row=conn.execute("""SELECT a.id,s.status FROM app.audit_logs a JOIN app.property_submissions s ON s.id=a.entity_id
              WHERE a.entity_type='owner_notification' AND a.action='owner_sms_pending' ORDER BY a.created_at LIMIT 1 FOR UPDATE OF a SKIP LOCKED""").fetchone()
            if not row:return False
            state='owner_sms_sending' if row['status']=='pending' else 'owner_sms_cancelled'
            conn.execute('UPDATE app.audit_logs SET action=%s WHERE id=%s',(state,row['id']))
    if state=='owner_sms_cancelled':return True
    try:
        reference=send_owner_submission_notice();state='owner_sms_accepted';data={'provider_reference':reference,'delivery_confirmed':False}
    except Exception:
        # A timeout may have occurred after acceptance: do not retry automatically and duplicate SMS.
        state='owner_sms_unconfirmed';data={'delivery_confirmed':False}
    with pool.connection() as conn:
        conn.execute('UPDATE app.audit_logs SET action=%s,after_data=after_data||%s WHERE id=%s',(state,Jsonb(data),row['id']));conn.commit()
    return True

async def worker(stop):
    while not stop.is_set():
        try:
            from .manager_notifications import process_one as process_manager
            # Always service both queues so repeated new events cannot starve seller SMS.
            active=await asyncio.to_thread(process_one)
            active=(await asyncio.to_thread(process_manager)) or active
        except Exception:
            logging.getLogger('evaz.operations').warning('Owner notification worker could not finish; inspect private notification status')
            active=False
        try:await asyncio.wait_for(stop.wait(),timeout=2 if active else 30)
        except asyncio.TimeoutError:pass
