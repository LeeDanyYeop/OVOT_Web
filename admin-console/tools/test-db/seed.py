import json,sys
s=json.load(open(sys.argv[1]))
D="2026-10-10"
def ts(t): return "NULL" if not t else f"'{D} {t}:00+09'"
def q(v): return "NULL" if v is None else "'"+str(v).replace("'","''")+"'"
out=["BEGIN;"]
for t in s["tasks"]:
    out.append(f"INSERT INTO tasks VALUES({q(t['task_id'])},{q(t['block_id'])},{q(t['zone_id'])},{q(t['task_type'])},{q(t['status'])},{ts(t['updated_at'])});")
for v in s["voice_records"]:
    out.append(f"INSERT INTO voice_records VALUES({q(v['voice_id'])},{q(v['worker_id'])},{q(v['zone_id'])},{q(v['block_id'])},{q(v['task_id'])},{q(v['transcript'])},{ts(v['at'])});")
for e in s["events"]:
    out.append(f"INSERT INTO events(voice_id,task_id,event_type,event_status,summary,created_at,speech_type) VALUES({q(e['voice_id'])},{q(e['task_id'])},{q(e['event_type'])},{q(e['event_status'])},{q(e['summary'])},{ts(e['at'])},{q(e['speech_type'])});")
for h in s["handoffs"]:
    out.append(f"INSERT INTO handoffs(task_id,from_zone_id,to_zone_id,status,requested_at,accepted_at,completed_at) VALUES({q(h['task_id'])},{q(h['from_zone_id'])},{q(h['to_zone_id'])},{q(h['status'])},{ts(h['requested_at'])},{ts(h['accepted_at'])},{ts(h['completed_at'])});")
# 실제 DB에 존재한다고 README에 기록된 '구형 코드' 상황을 재현 (FK NOT VALID 우회 삽입)
out.append("ALTER TABLE events DISABLE TRIGGER ALL;")
out.append(f"INSERT INTO events(voice_id,task_id,event_type,event_status,summary,created_at) VALUES('V-108','T-101','WORK_PRIORITY_CHANGED','PENDING_VALIDATION','(구형 코드 재현용 테스트 행)',{ts('08:35')});")
out.append("ALTER TABLE events ENABLE TRIGGER ALL;")
out.append("COMMIT;")
print("\n".join(out))
